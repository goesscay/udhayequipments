import { Injectable, Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NotificationType } from '@udhay/shared';
import { OPEN_TICKET_STATUSES, STAGE_BY_CODE, TEAM_LABELS } from '@udhay/shared';
import { JobRunner } from '../jobs/jobs.module';
import { NotificationsService } from '../notifications/notifications.service';
import { RecipientsService } from '../notifications/recipients.service';
import { PrismaService } from '../prisma/prisma.module';
import { SLA_EXEMPT_STAGES, formatDuration, slaLevelFor, type SlaConfig, type SlaLevel } from './sla-levels';

const ALERT_TYPE: Record<Exclude<SlaLevel, 0>, NotificationType> = {
  1: 'SLA_DUE_SOON',
  2: 'SLA_OVERDUE',
  3: 'SLA_ESCALATED',
};

const istTime = (d: Date) =>
  d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });

/**
 * Checks open stages against their due time and raises alerts in steps:
 * 1. due soon → stage owner
 * 2. overdue → stage owner + team head
 * 3. overdue for SLA_ESCALATE_AFTER_HOURS → also Admin / Super Admin
 * Each step fires once per stage visit (tracked in ProjectStage.slaAlertLevel).
 */
@Injectable()
export class SlaService implements OnModuleInit {
  private readonly cfg: SlaConfig;
  private readonly everyMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly recipients: RecipientsService,
    private readonly notifications: NotificationsService,
    private readonly runner: JobRunner,
    config: ConfigService,
  ) {
    this.cfg = {
      dueSoonHours: Number(config.get('SLA_DUE_SOON_HOURS', 4)),
      escalateAfterHours: Number(config.get('SLA_ESCALATE_AFTER_HOURS', 24)),
    };
    this.everyMinutes = Number(config.get('SLA_CHECK_EVERY_MINUTES', 10));
  }

  onModuleInit() {
    this.runner.register({
      name: 'sla-check',
      everyMs: this.everyMinutes * 60_000,
      leaseMs: 5 * 60_000,
      run: () => this.check(),
    });
  }

  async check(now = new Date()) {
    const horizon = new Date(now.getTime() + this.cfg.dueSoonHours * 3_600_000);
    const stages = await this.prisma.projectStage.findMany({
      where: {
        status: 'OPEN',
        slaAlertLevel: { lt: 3 },
        dueAt: { lte: horizon },
        stage: { notIn: SLA_EXEMPT_STAGES },
        project: { status: 'ACTIVE', deletedAt: null },
      },
      include: {
        assignee: { select: { name: true } },
        project: { select: { id: true, code: true, customer: { select: { name: true } } } },
      },
      orderBy: { dueAt: 'asc' },
      take: 500,
    });

    let alerts = 0;
    let notified = 0;
    for (const s of stages) {
      const level = slaLevelFor(s.dueAt!, now, this.cfg);
      if (level === 0 || level <= s.slaAlertLevel) continue;

      // Claim this level first so a parallel run can't send the same alert.
      const claimed = await this.prisma.projectStage.updateMany({
        where: { id: s.id, status: 'OPEN', slaAlertLevel: s.slaAlertLevel },
        data: { slaAlertLevel: level },
      });
      if (!claimed.count) continue;

      const [owners, heads, admins] = await Promise.all([
        this.recipients.stageOwners(s.stage, s.assigneeId),
        level >= 2 ? this.recipients.teamHeads(s.stage) : Promise.resolve([]),
        level >= 3 ? this.recipients.admins() : Promise.resolve([]),
      ]);

      const def = STAGE_BY_CODE[s.stage];
      const label = `${s.project.customer.name} (${s.project.code}) · ${def.label}`;
      const holder = `${TEAM_LABELS[def.team]} · ${s.assignee?.name ?? 'unassigned'}`;
      const late = formatDuration(now.getTime() - s.dueAt!.getTime());
      const copy = {
        1: { title: `Due soon: ${label}`, body: `Due ${istTime(s.dueAt!)} (in ${formatDuration(s.dueAt!.getTime() - now.getTime())}). With ${holder}.` },
        2: { title: `Overdue: ${label}`, body: `Was due ${istTime(s.dueAt!)}. With ${holder}.` },
        3: { title: `Escalated: ${label} is ${late} overdue`, body: `Was due ${istTime(s.dueAt!)}. With ${holder}.` },
      }[level];

      notified += await this.notifications.notify({
        userIds: [...owners, ...heads, ...admins],
        type: ALERT_TYPE[level],
        title: copy.title,
        body: copy.body,
        projectId: s.project.id,
      });
      alerts++;
    }
    const tickets = await this.ticketAlerts(now);
    return { checked: stages.length, alerts, notified, ticketAlerts: tickets };
  }

  /** One alert per overdue service ticket: the technician (or Service team) and Service heads. */
  private async ticketAlerts(now: Date) {
    const overdue = await this.prisma.serviceTicket.findMany({
      where: { status: { in: OPEN_TICKET_STATUSES }, slaAlerted: false, dueAt: { lt: now } },
      include: { project: { select: { customer: { select: { name: true } } } } },
      take: 200,
    });
    let sent = 0;
    for (const t of overdue) {
      const claimed = await this.prisma.serviceTicket.updateMany({
        where: { id: t.id, slaAlerted: false },
        data: { slaAlerted: true },
      });
      if (!claimed.count) continue;
      const [owners, heads] = await Promise.all([
        t.assigneeId ? Promise.resolve([t.assigneeId]) : this.recipients.teamWith('SERVICE', 'service.manage'),
        this.recipients.teamHeads('SERVICE'),
      ]);
      await this.notifications.notify({
        userIds: [...owners, ...heads],
        type: 'TICKET_OVERDUE',
        title: `Overdue ticket ${t.code}: ${t.project.customer.name}`,
        body: `${t.title} · was due ${istTime(t.dueAt!)}`,
        projectId: t.projectId,
      });
      sent++;
    }
    return sent;
  }
}

@Module({ providers: [SlaService], exports: [SlaService] })
export class SlaModule {}
