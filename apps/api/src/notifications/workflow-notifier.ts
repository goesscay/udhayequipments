import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { STAGE_BY_CODE, TEAM_LABELS } from '@udhay/shared';
import {
  ProjectEvents,
  type ProjectAssignedEvent,
  type ProjectTransitionedEvent,
} from '../common/events';
import { PrismaService } from '../prisma/prisma.module';
import { NotificationsService } from './notifications.service';
import { RecipientsService } from './recipients.service';

const dueText = (d: Date | null) =>
  d ? `Due ${d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}.` : '';

/** Turns workflow events into in-app notifications. Failures are logged, never thrown back to the user. */
@Injectable()
export class WorkflowNotifier {
  private readonly logger = new Logger(WorkflowNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly recipients: RecipientsService,
    private readonly notifications: NotificationsService,
  ) {}

  @OnEvent(ProjectEvents.TRANSITIONED, { async: true, promisify: true })
  async onTransition(e: ProjectTransitionedEvent) {
    try {
      const project = await this.prisma.project.findUnique({
        where: { id: e.projectId },
        include: {
          customer: { select: { name: true } },
          stages: { where: { status: 'OPEN' }, orderBy: { startedAt: 'desc' }, take: 1 },
        },
      });
      const actor = await this.prisma.user.findUnique({ where: { id: e.actorId }, select: { name: true } });
      if (!project || !actor) return;
      const label = `${project.customer.name} (${project.code})`;

      if (!e.to) {
        // Project closed (lost or completed): tell the sales owner and management.
        const admins = await this.recipients.admins();
        await this.notifications.notify({
          userIds: [project.salesOwnerId, ...admins],
          excludeUserId: e.actorId,
          type: 'CLOSED',
          title: `${e.outcome === 'LOST' ? 'Lost' : 'Completed'}: ${label}`,
          body: [`Closed by ${actor.name}.`, e.reason ? `Reason: ${e.reason}` : ''].filter(Boolean).join('\n'),
          projectId: project.id,
        });
        return;
      }

      const open = project.stages[0];
      const toDef = STAGE_BY_CODE[e.to];
      const owners = await this.recipients.stageOwners(e.to, open?.assigneeId ?? null);
      await this.notifications.notify({
        userIds: owners,
        excludeUserId: e.actorId,
        type: e.backwards ? 'RETURNED' : 'HANDOFF',
        title: e.backwards
          ? `Returned for revision: ${label} · ${toDef.label}`
          : `New handoff: ${label} · ${toDef.label}`,
        body: [
          `${actor.name} sent this from ${STAGE_BY_CODE[e.from].label} to ${TEAM_LABELS[toDef.team]}.`,
          e.reason ? `Reason: ${e.reason}` : '',
          dueText(open?.dueAt ?? null),
        ]
          .filter(Boolean)
          .join('\n'),
        projectId: project.id,
      });
    } catch (err) {
      this.logger.error(`Handoff notification failed for ${e.projectId}: ${(err as Error).message}`);
    }
  }

  @OnEvent(ProjectEvents.ASSIGNED, { async: true, promisify: true })
  async onAssigned(e: ProjectAssignedEvent) {
    try {
      const project = await this.prisma.project.findUnique({
        where: { id: e.projectId },
        include: { customer: { select: { name: true } } },
      });
      const actor = await this.prisma.user.findUnique({ where: { id: e.actorId }, select: { name: true } });
      if (!project || !actor) return;
      await this.notifications.notify({
        userIds: [e.assigneeId],
        excludeUserId: e.actorId,
        type: 'ASSIGNED',
        title: `Assigned to you: ${project.customer.name} (${project.code}) · ${STAGE_BY_CODE[e.stage].label}`,
        body: `${actor.name} assigned this to you. ${dueText(project.stageDueAt)}`.trim(),
        projectId: project.id,
      });
    } catch (err) {
      this.logger.error(`Assignment notification failed for ${e.projectId}: ${(err as Error).message}`);
    }
  }
}
