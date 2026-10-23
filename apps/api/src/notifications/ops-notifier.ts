import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { STAGE_BY_CODE } from '@udhay/shared';
import {
  ProjectEvents,
  TicketEvents,
  type PaymentReceivedEvent,
  type ProjectAcceptedEvent,
  type ProjectMentionedEvent,
  type TicketEvent,
} from '../common/events';
import { PrismaService } from '../prisma/prisma.module';
import { NotificationsService } from './notifications.service';
import { RecipientsService } from './recipients.service';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/** In-app notifications for payments, mentions, accepted handoffs and service tickets. */
@Injectable()
export class OpsNotifier {
  private readonly logger = new Logger(OpsNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly recipients: RecipientsService,
    private readonly notifications: NotificationsService,
  ) {}

  @OnEvent(ProjectEvents.MENTIONED, { async: true, promisify: true })
  async onMention(e: ProjectMentionedEvent) {
    await this.safely('mention', async () => {
      const [project, actor] = await Promise.all([this.project(e.projectId), this.userName(e.actorId)]);
      if (!project) return;
      await this.notifications.notify({
        userIds: e.userIds,
        excludeUserId: e.actorId,
        type: 'MENTION',
        title: `${actor} mentioned you on ${project.label}`,
        body: e.excerpt,
        projectId: e.projectId,
      });
    });
  }

  /** Tells whoever handed the work over that the receiving team has picked it up. */
  @OnEvent(ProjectEvents.ACCEPTED, { async: true, promisify: true })
  async onAccepted(e: ProjectAcceptedEvent) {
    await this.safely('accepted', async () => {
      const handoff = await this.prisma.stageTransition.findFirst({
        where: { projectId: e.projectId, toStage: e.stage, NOT: { fromStage: e.stage } },
        orderBy: { createdAt: 'desc' },
        select: { byUserId: true },
      });
      if (!handoff) return;
      const [project, actor] = await Promise.all([this.project(e.projectId), this.userName(e.actorId)]);
      if (!project) return;
      await this.notifications.notify({
        userIds: [handoff.byUserId],
        excludeUserId: e.actorId,
        type: 'HANDOFF_ACCEPTED',
        title: `${actor} accepted ${project.label} · ${STAGE_BY_CODE[e.stage].label}`,
        projectId: e.projectId,
      });
    });
  }

  /** Sales owner hears about money in; the current stage owner too, since it may unblock them. */
  @OnEvent(ProjectEvents.PAYMENT_RECEIVED, { async: true, promisify: true })
  async onPayment(e: PaymentReceivedEvent) {
    await this.safely('payment', async () => {
      const project = await this.project(e.projectId);
      if (!project) return;
      const open = await this.prisma.projectStage.findFirst({
        where: { projectId: e.projectId, status: 'OPEN' },
        orderBy: { startedAt: 'desc' },
      });
      const owners = open ? await this.recipients.stageOwners(open.stage, open.assigneeId) : [];
      await this.notifications.notify({
        userIds: [project.salesOwnerId, ...owners],
        excludeUserId: e.actorId,
        type: 'PAYMENT_RECEIVED',
        title: `Payment received: ${project.label} · ${e.label}`,
        body: `${inr.format(e.amount)} recorded.`,
        projectId: e.projectId,
      });
    });
  }

  @OnEvent(TicketEvents.CREATED, { async: true, promisify: true })
  async onTicketCreated(e: TicketEvent) {
    await this.safely('ticket created', async () => {
      const t = await this.ticket(e.ticketId);
      if (!t) return;
      await this.notifications.notify({
        userIds: await this.recipients.teamWith('SERVICE', 'service.manage'),
        excludeUserId: e.actorId,
        type: 'TICKET_CREATED',
        title: `New service ticket ${t.code}: ${t.project.customer.name}`,
        body: `${t.title}${t.underWarranty ? ' · under warranty' : ''} · ${t.priority.toLowerCase()} priority`,
        projectId: t.projectId,
      });
    });
  }

  @OnEvent(TicketEvents.ASSIGNED, { async: true, promisify: true })
  async onTicketAssigned(e: TicketEvent) {
    await this.safely('ticket assigned', async () => {
      const t = await this.ticket(e.ticketId);
      if (!t?.assigneeId) return;
      await this.notifications.notify({
        userIds: [t.assigneeId],
        excludeUserId: e.actorId,
        type: 'TICKET_ASSIGNED',
        title: `Ticket ${t.code} assigned to you: ${t.project.customer.name}`,
        body: `${t.title} · ${t.priority.toLowerCase()} priority`,
        projectId: t.projectId,
      });
    });
  }

  private async project(id: string) {
    const p = await this.prisma.project.findUnique({
      where: { id },
      select: { code: true, salesOwnerId: true, customer: { select: { name: true } } },
    });
    return p && { ...p, label: `${p.customer.name} (${p.code})` };
  }

  private ticket(id: string) {
    return this.prisma.serviceTicket.findUnique({
      where: { id },
      include: { project: { select: { customer: { select: { name: true } } } } },
    });
  }

  private async userName(id: string) {
    return (await this.prisma.user.findUnique({ where: { id }, select: { name: true } }))?.name ?? 'Someone';
  }

  private async safely(what: string, fn: () => Promise<void>) {
    try {
      await fn();
    } catch (err) {
      this.logger.error(`${what} notification failed: ${(err as Error).message}`);
    }
  }
}
