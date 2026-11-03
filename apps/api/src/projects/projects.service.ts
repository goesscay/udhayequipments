import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import type { Paginated, ProjectDetail, ProjectListItem, QueueItem } from '@udhay/shared';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.module';
import { nextCode } from '../common/counter';
import { ProjectEvents, type ProjectMentionedEvent } from '../common/events';
import { extractMentions, plainMentions } from '../common/mentions';
import type { AuthUser } from '../common/types';
import { CustomersService } from '../customers/customers.module';
import { PrismaService } from '../prisma/prisma.module';
import type { CreateProjectDto, ListProjectsQuery, UpdateProjectDto } from './projects.dto';
import { detailInclude, listInclude, toListItem } from './project.mapper';
import { WorkflowService } from './workflow.service';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly workflow: WorkflowService,
    private readonly customers: CustomersService,
    private readonly events: EventEmitter2,
  ) {}

  async list(user: AuthUser, q: ListProjectsQuery): Promise<Paginated<ProjectListItem>> {
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20));
    const term = q.search?.trim();

    const where: Prisma.ProjectWhereInput = {
      AND: [
        this.access.projectWhere(user),
        {
          status: q.status,
          currentStage: q.stage,
          currentTeam: q.team,
          ...(q.overdue ? { status: 'ACTIVE', stageDueAt: { lt: new Date() } } : {}),
          ...(term
            ? {
                OR: [
                  { code: { contains: term } },
                  { title: { contains: term } },
                  { city: { contains: term } },
                  { customer: { name: { contains: term } } },
                  { customer: { phone: { contains: term } } },
                ],
              }
            : {}),
        },
      ],
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        include: listInclude,
        orderBy: q.overdue ? { stageDueAt: 'asc' } : { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.project.count({ where }),
    ]);
    const showPrice = this.access.canSeePrices(user);
    return { items: rows.map((r) => toListItem(r, showPrice)), total, page, pageSize };
  }

  /** Open stages waiting on this user (or unassigned in their team). */
  async queue(user: AuthUser): Promise<QueueItem[]> {
    const actScope = this.access.scopeOf(user, 'stage.act');
    const or: Prisma.ProjectStageWhereInput[] = [{ assigneeId: user.id }];
    if (user.team && actScope) {
      or.push(actScope === 'OWN' ? { team: user.team, assigneeId: null } : { team: user.team });
    }
    if (this.access.scopeOf(user, 'cad.approve')) or.push({ stage: 'HEAD_APPROVAL' });

    const stages = await this.prisma.projectStage.findMany({
      where: { status: 'OPEN', OR: or, project: { status: 'ACTIVE', deletedAt: null } },
      include: {
        assignee: { select: { id: true, name: true } },
        project: { include: { customer: { select: { name: true } } } },
      },
      orderBy: [{ dueAt: 'asc' }],
      take: 200,
    });
    return stages.map((s) => ({
      stageId: s.id,
      project: {
        id: s.project.id,
        code: s.project.code,
        title: s.project.title,
        customerName: s.project.customer.name,
        city: s.project.city,
        priority: s.project.priority,
      },
      stage: s.stage,
      cycle: s.cycle,
      assignee: s.assignee,
      accepted: !!s.acceptedAt,
      startedAt: s.startedAt.toISOString(),
      dueAt: s.dueAt?.toISOString() ?? null,
    }));
  }

  async detail(user: AuthUser, id: string): Promise<ProjectDetail> {
    const p = await this.prisma.project.findFirst({
      where: { AND: [this.access.projectWhere(user), { id }] },
      include: detailInclude,
    });
    if (!p) throw new NotFoundException('Project not found');

    const showPrice = this.access.canSeePrices(user);
    const canSeeDocs = !!this.access.scopeOf(user, 'document.view');
    const openRow = [...p.stages].reverse().find((s) => s.status === 'OPEN') ?? null;
    const ctx = { currentStage: p.currentStage, salesOwnerId: p.salesOwnerId, openStage: openRow };
    const iso = (d: Date | null) => d?.toISOString() ?? null;

    return {
      ...toListItem({ ...p, stages: openRow ? [openRow] : [] }, showPrice),
      siteAddress: p.siteAddress,
      requirement: p.requirement,
      holdReason: p.holdReason,
      createdAt: p.createdAt.toISOString(),
      customerContact: {
        contactPerson: p.customer.contactPerson,
        phone: p.customer.phone,
        email: p.customer.email,
      },
      stages: p.stages.map((s) => ({
        id: s.id,
        stage: s.stage,
        team: s.team,
        cycle: s.cycle,
        status: s.status,
        assignee: s.assignee,
        startedAt: s.startedAt.toISOString(),
        acceptedAt: iso(s.acceptedAt),
        dueAt: iso(s.dueAt),
        completedAt: iso(s.completedAt),
      })),
      timeline: p.transitions.map((t) => ({
        id: t.id,
        action: t.action,
        fromStage: t.fromStage,
        toStage: t.toStage,
        reason: t.reason,
        by: t.byUser,
        createdAt: t.createdAt.toISOString(),
      })),
      documents: canSeeDocs
        ? p.documents
            // Commercial documents are hidden from users who can't see prices.
            .filter((d) => showPrice || !['QUOTATION', 'BOQ'].includes(d.type))
            .map((d) => ({
              id: d.id,
              type: d.type,
              stage: d.stage,
              version: d.version,
              fileName: d.fileName,
              sizeBytes: d.sizeBytes,
              uploadedBy: d.uploadedBy,
              createdAt: d.createdAt.toISOString(),
            }))
        : [],
      comments: p.comments.map((c) => ({
        id: c.id,
        body: c.body,
        author: c.author,
        createdAt: c.createdAt.toISOString(),
      })),
      availableActions: await this.workflow.availableActions(user, p, openRow),
      canAccept: p.status === 'ACTIVE' && !!openRow && !openRow.acceptedAt && this.access.canAccept(user, ctx),
      canAssign: p.status === 'ACTIVE' && !!this.access.scopeOf(user, 'stage.assign'),
      canManage: !!this.access.scopeOf(user, 'project.manage'),
      canOverride: user.roleCode === 'SUPER_ADMIN',
    };
  }

  async create(user: AuthUser, dto: CreateProjectDto) {
    const scope = this.access.require(user, 'project.create');
    if (scope !== 'ALL' && user.team !== 'SALES') {
      throw new ForbiddenException('Only the Sales team can create projects');
    }

    const id = await this.prisma.$transaction(async (tx) => {
      const customerId =
        dto.customerId ??
        (
          await this.customers.create(
            user,
            {
              name: dto.customerName!,
              contactPerson: dto.contactPerson,
              phone: dto.customerPhone!,
              email: dto.customerEmail,
              city: dto.city,
              address: dto.siteAddress,
            },
            tx,
          )
        ).id;

      const code = await nextCode(tx, 'UDH', 'project');

      // Sales members own what they create; admins may assign another sales owner.
      const salesOwnerId = scope === 'ALL' && dto.salesOwnerId ? dto.salesOwnerId : user.id;
      const now = new Date();
      const project = await tx.project.create({
        data: {
          code,
          title: dto.title.trim(),
          customerId,
          siteAddress: dto.siteAddress?.trim() || null,
          city: dto.city?.trim() || null,
          requirement: dto.requirement?.trim() || null,
          estimatedValue: dto.estimatedValue ?? null,
          priority: dto.priority ?? 'NORMAL',
          salesOwnerId,
          createdById: user.id,
        },
      });
      await this.workflow.startProject(tx, project.id, salesOwnerId, now);
      await tx.stageTransition.create({
        data: { projectId: project.id, fromStage: null, toStage: 'LEAD', action: 'CREATE', byUserId: user.id },
      });
      await this.audit.log({ actorId: user.id, entity: 'project', entityId: project.id, action: 'create', data: { code } }, tx);
      return project.id;
    });
    return this.detail(user, id);
  }

  async update(user: AuthUser, id: string, dto: UpdateProjectDto) {
    await this.findVisible(user, id, 'project.update');
    if (dto.estimatedValue !== undefined && !this.access.canSeePrices(user)) {
      throw new ForbiddenException('You cannot change the project value');
    }
    await this.prisma.project.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        siteAddress: dto.siteAddress?.trim(),
        city: dto.city?.trim(),
        requirement: dto.requirement?.trim(),
        estimatedValue: dto.estimatedValue,
        priority: dto.priority,
      },
    });
    await this.audit.log({ actorId: user.id, entity: 'project', entityId: id, action: 'update', data: { changed: Object.keys(dto) } });
    return this.detail(user, id);
  }

  async addComment(user: AuthUser, id: string, body: string) {
    const project = await this.findVisible(user, id, 'project.view');
    const text = body.trim();
    const mentioned = await this.mentionableIds(id, extractMentions(text), user.id);
    const comment = await this.prisma.comment.create({
      data: {
        projectId: id,
        stage: project.currentStage,
        body: text,
        mentions: mentioned.length ? mentioned : undefined,
        authorId: user.id,
      },
      include: { author: { select: { id: true, name: true } } },
    });
    if (mentioned.length) {
      const event: ProjectMentionedEvent = {
        projectId: id,
        actorId: user.id,
        userIds: mentioned,
        excerpt: plainMentions(text).slice(0, 160),
      };
      this.events.emit(ProjectEvents.MENTIONED, event);
    }
    return comment;
  }

  /** Mentioned users who are active and can actually open this project. */
  private async mentionableIds(projectId: string, ids: string[], authorId: string) {
    const out: string[] = [];
    for (const uid of ids.filter((x) => x !== authorId).slice(0, 20)) {
      const u = await this.access.loadAuthUser(uid);
      if (!u || !u.permissions['project.view']) continue;
      const visible = await this.prisma.project.count({ where: { AND: [this.access.projectWhere(u), { id: projectId }] } });
      if (visible) out.push(uid);
    }
    return out;
  }

  private async findVisible(user: AuthUser, id: string, permission: 'project.view' | 'project.update') {
    const p = await this.prisma.project.findFirst({ where: { AND: [this.access.projectWhere(user, permission), { id }] } });
    if (!p) throw new NotFoundException('Project not found');
    return p;
  }
}
