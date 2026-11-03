import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import {
  DOCUMENT_LABELS,
  TEAM_LABELS,
  type AvailableAction,
  type DocumentType,
  type ProjectStatus,
  type StageCode,
  type TeamCode,
  type WorkflowAction,
} from '@udhay/shared';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.module';
import {
  ProjectEvents,
  type ProjectAcceptedEvent,
  type ProjectAssignedEvent,
  type ProjectTransitionedEvent,
} from '../common/events';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.module';
import { WorkflowConfigService } from '../settings/workflow-config.service';
import { GatesService } from './gates.service';

type Tx = Prisma.TransactionClient;

const addHours = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000);

const STATUS_WORDS: Record<ProjectStatus, string> = {
  ACTIVE: 'Active',
  ON_HOLD: 'On hold',
  LOST: 'Lost',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

/**
 * The workflow engine. Every stage change goes through here so that permission checks,
 * document gates, SLA dates, the timeline and the audit log stay consistent.
 */
@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
    private readonly gates: GatesService,
    private readonly workflow: WorkflowConfigService,
  ) {}

  async transition(user: AuthUser, projectId: string, action: WorkflowAction, reason?: string) {
    const { result, event } = await this.prisma.$transaction(async (tx) => {
      const project = await this.loadForUpdate(tx, user, projectId);
      if (project.status !== 'ACTIVE') throw new BadRequestException('Project is not active');

      const wf = this.workflow.current;
      const def = wf.find(project.currentStage, action);
      if (!def) {
        throw new BadRequestException(
          `"${action}" is not allowed at stage ${wf.stage(project.currentStage).label}`,
        );
      }
      const open = project.stages[0] ?? null;
      const ctx = { currentStage: project.currentStage, salesOwnerId: project.salesOwnerId, openStage: open };
      if (!this.access.canPerformTransition(user, def, ctx)) {
        throw new ForbiddenException('You cannot perform this action on this stage');
      }
      if (def.reasonRequired && !reason?.trim()) {
        throw new BadRequestException('Please give a reason');
      }
      // Report every unmet condition at once so people fix them in one go.
      const missing = def.requiresDocuments?.length
        ? await this.missingDocuments(tx, projectId, def.requiresDocuments, open)
        : [];
      const blockers = await this.gates.blockers(tx, projectId, def);
      if (missing.length || blockers.length) {
        const parts = [...blockers, ...(missing.length ? [`Upload: ${missing.map((m) => DOCUMENT_LABELS[m]).join(', ')}`] : [])];
        throw new BadRequestException({ message: parts.join('; '), missing, blockers });
      }

      const now = new Date();
      const backwards = def.to !== null && wf.index(def.to) < wf.index(project.currentStage);
      if (open) {
        await tx.projectStage.update({
          where: { id: open.id },
          data: {
            status: backwards ? 'RETURNED' : 'DONE',
            completedAt: now,
            assigneeId: open.assigneeId ?? user.id,
            acceptedAt: open.acceptedAt ?? now,
            acceptedById: open.acceptedById ?? user.id,
          },
        });
      }

      if (def.to) {
        await this.openStage(tx, project.id, def.to, project.salesOwnerId, now);
      } else {
        await tx.project.update({
          where: { id: project.id },
          data: { status: def.outcome!, closedAt: now, stageDueAt: null },
        });
      }

      await tx.stageTransition.create({
        data: {
          projectId,
          fromStage: project.currentStage,
          toStage: def.to,
          action,
          reason: reason?.trim() || null,
          byUserId: user.id,
        },
      });
      await this.audit.log(
        {
          actorId: user.id,
          entity: 'project',
          entityId: projectId,
          action: `transition.${action}`,
          data: { from: project.currentStage, to: def.to, outcome: def.outcome ?? null },
        },
        tx,
      );
      const event: ProjectTransitionedEvent = {
        projectId,
        actorId: user.id,
        action,
        from: project.currentStage,
        to: def.to,
        outcome: def.outcome ?? null,
        backwards,
        reason: reason?.trim() || null,
      };
      return { result: { id: projectId, stage: def.to, status: def.to ? 'ACTIVE' : def.outcome }, event };
    });
    this.events.emit(ProjectEvents.TRANSITIONED, event);
    return result;
  }

  /** Receiving team acknowledges the handoff; the acceptor becomes the assignee if none is set. */
  async accept(user: AuthUser, projectId: string) {
    const event = await this.prisma.$transaction(async (tx): Promise<ProjectAcceptedEvent> => {
      const project = await this.loadForUpdate(tx, user, projectId);
      const open = project.stages[0];
      if (!open || project.status !== 'ACTIVE') throw new BadRequestException('Nothing to accept');
      if (open.acceptedAt) throw new BadRequestException('Already accepted');
      const ctx = { currentStage: project.currentStage, salesOwnerId: project.salesOwnerId, openStage: open };
      if (!this.access.canAccept(user, ctx)) throw new ForbiddenException('This stage belongs to another team');

      const now = new Date();
      await tx.projectStage.update({
        where: { id: open.id },
        data: { acceptedAt: now, acceptedById: user.id, assigneeId: open.assigneeId ?? user.id },
      });
      await this.record(tx, user, project.id, project.currentStage, 'ACCEPT_HANDOFF');
      return { projectId: project.id, actorId: user.id, stage: project.currentStage };
    });
    this.events.emit(ProjectEvents.ACCEPTED, event);
    return { ok: true };
  }

  async assign(user: AuthUser, projectId: string, assigneeId: string) {
    const scope = this.access.require(user, 'stage.assign');
    const event = await this.prisma.$transaction(async (tx): Promise<ProjectAssignedEvent> => {
      const project = await this.loadForUpdate(tx, user, projectId);
      const open = project.stages[0];
      if (!open || project.status !== 'ACTIVE') throw new BadRequestException('No open stage to assign');

      const stageTeam = open.team;
      if (scope !== 'ALL' && user.team !== stageTeam) {
        throw new ForbiddenException('You can only assign work in your own team');
      }
      const assignee = await tx.user.findFirst({
        where: { id: assigneeId, isActive: true, deletedAt: null },
        include: { team: true },
      });
      if (!assignee) throw new BadRequestException('User not found');
      if (stageTeam !== 'MANAGEMENT' && assignee.team?.code !== stageTeam) {
        throw new BadRequestException(`Assignee must belong to the ${stageTeam} team`);
      }

      await tx.projectStage.update({
        where: { id: open.id },
        data: { assigneeId, acceptedAt: null, acceptedById: null },
      });
      await this.record(tx, user, project.id, project.currentStage, 'ASSIGN', `Assigned to ${assignee.name}`);
      return { projectId: project.id, actorId: user.id, assigneeId, stage: project.currentStage };
    });
    this.events.emit(ProjectEvents.ASSIGNED, event);
    return { ok: true };
  }

  async setHold(user: AuthUser, projectId: string, hold: boolean, reason?: string) {
    this.access.require(user, 'project.manage');
    return this.prisma.$transaction(async (tx) => {
      const project = await this.loadForUpdate(tx, user, projectId);
      if (hold) {
        if (project.status !== 'ACTIVE') throw new BadRequestException('Only active projects can be put on hold');
        if (!reason?.trim()) throw new BadRequestException('Please give a reason');
        await tx.project.update({ where: { id: projectId }, data: { status: 'ON_HOLD', holdReason: reason.trim() } });
        await this.record(tx, user, projectId, project.currentStage, 'HOLD', reason);
      } else {
        if (project.status !== 'ON_HOLD') throw new BadRequestException('Project is not on hold');
        // The SLA clock restarts for the current stage when work resumes.
        const dueAt = addHours(new Date(), await this.slaHours(tx, project.currentStage));
        await tx.project.update({ where: { id: projectId }, data: { status: 'ACTIVE', holdReason: null, stageDueAt: dueAt } });
        if (project.stages[0]) {
          await tx.projectStage.update({ where: { id: project.stages[0].id }, data: { dueAt, slaAlertLevel: 0 } });
        }
        await this.record(tx, user, projectId, project.currentStage, 'RESUME');
      }
      return { ok: true };
    });
  }

  async cancel(user: AuthUser, projectId: string, reason: string) {
    this.access.require(user, 'project.manage');
    if (!reason?.trim()) throw new BadRequestException('Please give a reason');
    return this.prisma.$transaction(async (tx) => {
      const project = await this.loadForUpdate(tx, user, projectId);
      if (!['ACTIVE', 'ON_HOLD'].includes(project.status)) throw new BadRequestException('Project is already closed');
      await tx.project.update({
        where: { id: projectId },
        data: { status: 'CANCELLED', closedAt: new Date(), stageDueAt: null },
      });
      await this.record(tx, user, projectId, project.currentStage, 'CANCEL', reason);
      return { ok: true };
    });
  }

  // ── Super Admin overrides ─────────────────────────────────────────

  /**
   * Super Admin: set any status, including reopening a lost, completed or cancelled project.
   * Reopening (or putting a closed project on hold) restarts the stage it was at as a new cycle.
   */
  async setStatus(user: AuthUser, projectId: string, status: ProjectStatus, reason: string) {
    this.requireSuperAdmin(user);
    if (!reason?.trim()) throw new BadRequestException('Please give a reason');
    await this.prisma.$transaction(async (tx) => {
      const project = await this.loadForUpdate(tx, user, projectId);
      if (project.status === status) throw new BadRequestException('The project already has this status');
      const now = new Date();
      const open = project.stages[0] ?? null;

      if (status === 'LOST' || status === 'COMPLETED' || status === 'CANCELLED') {
        if (open) {
          await tx.projectStage.update({ where: { id: open.id }, data: { status: 'DONE', completedAt: now } });
        }
        await tx.project.update({
          where: { id: projectId },
          data: { status, closedAt: now, stageDueAt: null, holdReason: null },
        });
      } else {
        // ACTIVE or ON_HOLD need an open stage to work on; the stage clock restarts.
        let dueAt: Date;
        if (open) {
          dueAt = addHours(now, await this.slaHours(tx, project.currentStage));
          await tx.projectStage.update({ where: { id: open.id }, data: { dueAt, slaAlertLevel: 0 } });
        } else {
          await this.openStage(tx, projectId, project.currentStage, project.salesOwnerId, now);
          dueAt = (await tx.project.findUniqueOrThrow({ where: { id: projectId } })).stageDueAt!;
        }
        await tx.project.update({
          where: { id: projectId },
          data: { status, closedAt: null, stageDueAt: dueAt, holdReason: status === 'ON_HOLD' ? reason.trim() : null },
        });
      }
      await this.record(
        tx,
        user,
        projectId,
        project.currentStage,
        'STATUS_CHANGED',
        `${STATUS_WORDS[project.status]} → ${STATUS_WORDS[status]}: ${reason.trim()}`,
      );
    });
    return { ok: true, status };
  }

  /** Super Admin: jump an active (or on-hold) project to any stage, skipping the normal checks. */
  async moveToStage(user: AuthUser, projectId: string, stage: StageCode, reason: string) {
    this.requireSuperAdmin(user);
    if (!reason?.trim()) throw new BadRequestException('Please give a reason');
    const wf = this.workflow.current;
    if (wf.index(stage) < 0) throw new BadRequestException('Unknown stage');
    const event = await this.prisma.$transaction(async (tx): Promise<ProjectTransitionedEvent> => {
      const project = await this.loadForUpdate(tx, user, projectId);
      if (project.status !== 'ACTIVE' && project.status !== 'ON_HOLD') {
        throw new BadRequestException('Reopen the project first (change its status to Active)');
      }
      if (project.currentStage === stage) throw new BadRequestException('The project is already at this stage');
      const now = new Date();
      const backwards = wf.index(stage) < wf.index(project.currentStage);
      const open = project.stages[0];
      if (open) {
        await tx.projectStage.update({
          where: { id: open.id },
          data: { status: backwards ? 'RETURNED' : 'DONE', completedAt: now },
        });
      }
      await this.openStage(tx, projectId, stage, project.salesOwnerId, now);
      await tx.stageTransition.create({
        data: {
          projectId,
          fromStage: project.currentStage,
          toStage: stage,
          action: 'MOVED_TO_STAGE',
          reason: reason.trim(),
          byUserId: user.id,
        },
      });
      await this.audit.log(
        { actorId: user.id, entity: 'project', entityId: projectId, action: 'move', data: { from: project.currentStage, to: stage, reason } },
        tx,
      );
      return {
        projectId,
        actorId: user.id,
        action: 'MOVE',
        from: project.currentStage,
        to: stage,
        outcome: null,
        backwards,
        reason: reason.trim(),
      };
    });
    this.events.emit(ProjectEvents.TRANSITIONED, event);
    return { ok: true };
  }

  /**
   * Super Admin: hand the current stage to any team and, optionally, a person. The project then
   * shows in that team's queue and its members can act on it.
   */
  async reassign(user: AuthUser, projectId: string, team: TeamCode, assigneeId?: string, reason?: string) {
    this.requireSuperAdmin(user);
    const { project, assignee } = await this.prisma.$transaction(async (tx) => {
      const project = await this.loadForUpdate(tx, user, projectId);
      const open = project.stages[0];
      if (!open || (project.status !== 'ACTIVE' && project.status !== 'ON_HOLD')) {
        throw new BadRequestException('No open stage to hand over');
      }
      let assignee: { id: string; name: string } | null = null;
      if (assigneeId) {
        const u = await tx.user.findFirst({
          where: { id: assigneeId, isActive: true, deletedAt: null },
          include: { team: true },
        });
        if (!u) throw new BadRequestException('User not found');
        // Picking someone sends the work to their team (people without a team, e.g. Accounts, keep the chosen one).
        if (u.team) team = u.team.code;
        assignee = { id: u.id, name: u.name };
      }
      if (team === open.team && (assignee?.id ?? null) === open.assigneeId) {
        throw new BadRequestException('Nothing to change: it is already with them');
      }
      await tx.projectStage.update({
        where: { id: open.id },
        data: { team, assigneeId: assignee?.id ?? null, acceptedAt: null, acceptedById: null },
      });
      await tx.project.update({ where: { id: projectId }, data: { currentTeam: team } });
      const parts = [
        team !== open.team ? `Handed to ${TEAM_LABELS[team]}` : null,
        assignee ? `Assigned to ${assignee.name}` : 'Unassigned',
      ].filter(Boolean);
      const note = parts.join(' · ') + (reason?.trim() ? ` · ${reason.trim()}` : '');
      await this.record(tx, user, projectId, project.currentStage, 'REASSIGNED', note);
      return { project, assignee };
    });

    if (assignee) {
      const e: ProjectAssignedEvent = { projectId, actorId: user.id, assigneeId: assignee.id, stage: project.currentStage };
      this.events.emit(ProjectEvents.ASSIGNED, e);
    } else {
      const e: ProjectTransitionedEvent = {
        projectId,
        actorId: user.id,
        action: 'REASSIGN',
        from: project.currentStage,
        to: project.currentStage,
        outcome: null,
        backwards: false,
        reason: reason?.trim() || null,
      };
      this.events.emit(ProjectEvents.TRANSITIONED, e);
    }
    return { ok: true };
  }

  private requireSuperAdmin(user: AuthUser) {
    if (user.roleCode !== 'SUPER_ADMIN') throw new ForbiddenException('Only a Super Admin can do this');
  }

  /** Actions the user can take right now, with missing documents and unmet rules for each. */
  async availableActions(
    user: AuthUser,
    project: {
      id: string;
      status: string;
      currentStage: StageCode;
      salesOwnerId: string;
      documents: { type: DocumentType; createdAt: Date }[];
    },
    open: { assigneeId: string | null; team?: TeamCode; cycle: number; startedAt: Date } | null,
  ): Promise<AvailableAction[]> {
    if (project.status !== 'ACTIVE') return [];
    const ctx = { currentStage: project.currentStage, salesOwnerId: project.salesOwnerId, openStage: open };
    const allowed = this.workflow.current.from(project.currentStage).filter((t) => this.access.canPerformTransition(user, t, ctx));
    return Promise.all(
      allowed.map(async (t) => ({
        action: t.action,
        label: t.label,
        tone: t.tone,
        reasonRequired: !!t.reasonRequired,
        missingDocuments: (t.requiresDocuments ?? []).filter(
          (type) =>
            !project.documents.some(
              (d) => d.type === type && (!open || open.cycle === 1 || d.createdAt >= open.startedAt),
            ),
        ),
        blockers: await this.gates.blockers(this.prisma, project.id, t),
      })),
    );
  }

  /** Creates the first stage of a new project. */
  async startProject(tx: Tx, projectId: string, salesOwnerId: string, now: Date) {
    await this.openStage(tx, projectId, 'LEAD', salesOwnerId, now, true);
  }

  // ── internals ─────────────────────────────────────────────────────

  private async loadForUpdate(tx: Tx, user: AuthUser, projectId: string) {
    // Row lock so two people can't move the same project at once.
    await tx.$queryRaw`SELECT id FROM Project WHERE id = ${projectId} FOR UPDATE`;
    const project = await tx.project.findFirst({
      where: { AND: [this.access.projectWhere(user), { id: projectId }] },
      include: { stages: { where: { status: 'OPEN' }, orderBy: { startedAt: 'desc' }, take: 1 } },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private async openStage(
    tx: Tx,
    projectId: string,
    stage: StageCode,
    salesOwnerId: string,
    now: Date,
    autoAccept = false,
  ) {
    const def = this.workflow.stage(stage);
    const previous = await tx.projectStage.findFirst({
      where: { projectId, stage },
      orderBy: { startedAt: 'desc' },
    });
    // Revisions go back to whoever handled the stage last; Sales stages go to the sales owner.
    const assigneeId = previous?.assigneeId ?? (def.team === 'SALES' ? salesOwnerId : null);
    const dueAt = addHours(now, await this.slaHours(tx, stage));

    await tx.projectStage.create({
      data: {
        projectId,
        stage,
        team: def.team,
        cycle: previous ? previous.cycle + 1 : 1,
        status: 'OPEN',
        assigneeId,
        startedAt: now,
        dueAt,
        acceptedAt: autoAccept ? now : null,
        acceptedById: autoAccept ? assigneeId : null,
      },
    });
    await tx.project.update({
      where: { id: projectId },
      data: { currentStage: stage, currentTeam: def.team, stageDueAt: dueAt },
    });
  }

  private async slaHours(tx: Tx, stage: StageCode) {
    const setting = await tx.stageSetting.findUnique({ where: { stage } });
    return setting?.slaHours ?? this.workflow.stage(stage).slaHours;
  }

  private async missingDocuments(
    tx: Tx,
    projectId: string,
    required: DocumentType[],
    open: { cycle: number; startedAt: Date } | null,
  ) {
    // On a revision cycle, a fresh document must be uploaded after the stage reopened.
    const docs = await tx.document.findMany({
      where: {
        projectId,
        deletedAt: null,
        type: { in: required },
        ...(open && open.cycle > 1 ? { createdAt: { gte: open.startedAt } } : {}),
      },
      select: { type: true },
    });
    const have = new Set(docs.map((d) => d.type));
    return required.filter((t) => !have.has(t));
  }

  private async record(tx: Tx, user: AuthUser, projectId: string, stage: StageCode, action: string, reason?: string) {
    await tx.stageTransition.create({
      data: { projectId, fromStage: stage, toStage: stage, action, reason: reason?.trim() || null, byUserId: user.id },
    });
    await this.audit.log(
      { actorId: user.id, entity: 'project', entityId: projectId, action: action.toLowerCase(), data: reason ? { reason } : undefined },
      tx,
    );
  }
}
