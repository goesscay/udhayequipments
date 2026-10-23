import { BadRequestException, Controller, ForbiddenException, Get, Injectable, Module, Param, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import {
  PAYMENT_KIND_LABELS,
  PROJECT_STATUSES,
  STAGES,
  STAGE_BY_CODE,
  TEAM_LABELS,
  type ReportSummary,
} from '@udhay/shared';
import type { Response } from 'express';
import { AccessService } from '../access/access.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.module';
import { average, median, monthKey, monthsBetween, parseRange, round1, toCsv } from './report-math';

const HOUR = 3_600_000;
const EXPORTS = ['projects', 'stage-durations', 'payments', 'tickets'] as const;
type ExportKind = (typeof EXPORTS)[number];

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 16).replace('T', ' ') : '');

@Injectable()
class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async summary(user: AuthUser, from?: string, to?: string): Promise<ReportSummary> {
    const range = parseRange(from, to);
    if (!range) throw new BadRequestException('Invalid date range');
    const { start, end } = range;
    const projects = this.access.projectWhere(user, 'report.view');
    const showPrice = this.access.canSeePrices(user);
    const inRange = { gte: start, lte: end };

    const [stages, decisions, created, payments, tickets, statusCounts] = await Promise.all([
      this.prisma.projectStage.findMany({
        where: { completedAt: inRange, project: projects },
        select: { stage: true, startedAt: true, completedAt: true, dueAt: true },
      }),
      this.prisma.stageTransition.findMany({
        where: {
          createdAt: inRange,
          project: projects,
          OR: [{ action: 'ACCEPT' }, { action: 'MARK_LOST' }, { action: 'REQUEST_REVISION', fromStage: 'CUSTOMER_DECISION' }],
        },
        include: { project: { select: { id: true, code: true, estimatedValue: true, customer: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.project.findMany({ where: { AND: [projects, { createdAt: inRange }] }, select: { createdAt: true } }),
      showPrice
        ? this.prisma.paymentMilestone.findMany({
            where: { status: 'RECEIVED', receivedAt: inRange, project: projects },
            select: { receivedAt: true, receivedAmount: true, amount: true },
          })
        : Promise.resolve([]),
      this.prisma.serviceTicket.findMany({
        where: { project: projects, OR: [{ createdAt: inRange }, { resolvedAt: inRange }, { closedAt: inRange }] },
        select: { createdAt: true, resolvedAt: true, closedAt: true, underWarranty: true, csatRating: true },
      }),
      this.prisma.project.groupBy({ by: ['status'], where: projects, _count: { _all: true } }),
    ]);

    const stageDurations = STAGES.map((s) => {
      const rows = stages.filter((r) => r.stage === s.code && r.completedAt);
      const hours = rows.map((r) => (r.completedAt!.getTime() - r.startedAt.getTime()) / HOUR);
      const withDue = rows.filter((r) => r.dueAt);
      const over = withDue.filter((r) => r.completedAt! > r.dueAt!).length;
      return {
        stage: s.code,
        completed: rows.length,
        avgHours: round1(average(hours)),
        medianHours: round1(median(hours)),
        overSlaPct: withDue.length ? Math.round((over / withDue.length) * 100) : null,
      };
    });

    const accepted = decisions.filter((d) => d.action === 'ACCEPT');
    const lost = decisions.filter((d) => d.action === 'MARK_LOST');
    const revisions = decisions.filter((d) => d.action === 'REQUEST_REVISION').length;

    const months = monthsBetween(start, end);
    const monthly = months.map((month) => {
      const won = accepted.filter((a) => monthKey(a.createdAt) === month);
      return {
        month,
        created: created.filter((p) => monthKey(p.createdAt) === month).length,
        won: won.length,
        wonValue: showPrice ? won.reduce((sum, a) => sum + Number(a.project.estimatedValue ?? 0), 0) : null,
        collected: showPrice
          ? payments
              .filter((p) => p.receivedAt && monthKey(p.receivedAt) === month)
              .reduce((sum, p) => sum + Number(p.receivedAmount ?? p.amount), 0)
          : null,
      };
    });

    const opened = tickets.filter((t) => t.createdAt >= start && t.createdAt <= end);
    const resolved = tickets.filter((t) => t.resolvedAt && t.resolvedAt >= start && t.resolvedAt <= end);
    const rated = tickets.filter((t) => t.closedAt && t.closedAt >= start && t.closedAt <= end && t.csatRating != null);

    return {
      range: { from: start.toISOString(), to: end.toISOString() },
      stageDurations,
      quotation: {
        accepted: accepted.length,
        lost: lost.length,
        revisions,
        winRatePct: accepted.length + lost.length ? Math.round((accepted.length / (accepted.length + lost.length)) * 100) : null,
      },
      lostReasons: lost.slice(0, 50).map((l) => ({
        projectId: l.project.id,
        projectCode: l.project.code,
        customerName: l.project.customer.name,
        reason: l.reason,
        date: l.createdAt.toISOString(),
      })),
      monthly,
      service: {
        opened: opened.length,
        resolved: resolved.length,
        avgResolutionHours: round1(average(resolved.map((t) => (t.resolvedAt!.getTime() - t.createdAt.getTime()) / HOUR))),
        avgCsat: round1(average(rated.map((t) => t.csatRating!))),
        underWarrantyPct: opened.length ? Math.round((opened.filter((t) => t.underWarranty).length / opened.length) * 100) : null,
      },
      projectsByStatus: PROJECT_STATUSES.map((status) => ({
        status,
        count: statusCounts.find((c) => c.status === status)?._count._all ?? 0,
      })),
    };
  }

  async exportCsv(user: AuthUser, kind: ExportKind, from?: string, to?: string) {
    const range = parseRange(from, to);
    if (!range) throw new BadRequestException('Invalid date range');
    const { start, end } = range;
    const projects = this.access.projectWhere(user, 'report.view');
    const showPrice = this.access.canSeePrices(user);
    const inRange = { gte: start, lte: end };

    switch (kind) {
      case 'projects': {
        const rows = await this.prisma.project.findMany({
          where: { AND: [projects, { createdAt: inRange }] },
          include: { customer: { select: { name: true, phone: true } }, salesOwner: { select: { name: true } } },
          orderBy: { createdAt: 'asc' },
        });
        return toCsv(
          ['Code', 'Title', 'Customer', 'Phone', 'City', 'Status', 'Stage', 'With team', 'Priority', 'Sales owner', ...(showPrice ? ['Value (INR)'] : []), 'Created', 'Closed'],
          rows.map((p) => [
            p.code, p.title, p.customer.name, p.customer.phone, p.city, p.status,
            STAGE_BY_CODE[p.currentStage].label, TEAM_LABELS[p.currentTeam], p.priority, p.salesOwner.name,
            ...(showPrice ? [p.estimatedValue == null ? null : Number(p.estimatedValue)] : []),
            iso(p.createdAt), iso(p.closedAt),
          ]),
        );
      }
      case 'stage-durations': {
        const rows = await this.prisma.projectStage.findMany({
          where: { completedAt: inRange, project: projects },
          include: { project: { select: { code: true } }, assignee: { select: { name: true } } },
          orderBy: { completedAt: 'asc' },
        });
        return toCsv(
          ['Project', 'Stage', 'Team', 'Round', 'Handled by', 'Started', 'Completed', 'Hours taken', 'Due', 'Late'],
          rows.map((s) => [
            s.project.code, STAGE_BY_CODE[s.stage].label, TEAM_LABELS[s.team], s.cycle, s.assignee?.name,
            iso(s.startedAt), iso(s.completedAt),
            s.completedAt ? round1((s.completedAt.getTime() - s.startedAt.getTime()) / HOUR) : null,
            iso(s.dueAt), s.dueAt && s.completedAt ? (s.completedAt > s.dueAt ? 'Yes' : 'No') : '',
          ]),
        );
      }
      case 'payments': {
        if (!showPrice) throw new ForbiddenException('You cannot export payment data');
        const rows = await this.prisma.paymentMilestone.findMany({
          where: { project: projects, OR: [{ createdAt: inRange }, { receivedAt: inRange }] },
          include: { project: { select: { code: true, customer: { select: { name: true } } } } },
          orderBy: { createdAt: 'asc' },
        });
        return toCsv(
          ['Project', 'Customer', 'Milestone', 'Type', 'Amount (INR)', 'Status', 'Due', 'Received on', 'Received (INR)', 'Mode', 'Reference'],
          rows.map((m) => [
            m.project.code, m.project.customer.name, m.label, PAYMENT_KIND_LABELS[m.kind], Number(m.amount), m.status,
            iso(m.dueDate), iso(m.receivedAt), m.receivedAmount == null ? null : Number(m.receivedAmount), m.mode, m.reference,
          ]),
        );
      }
      case 'tickets': {
        const where: Prisma.ServiceTicketWhereInput = { project: projects, createdAt: inRange };
        const rows = await this.prisma.serviceTicket.findMany({
          where,
          include: { project: { select: { code: true, customer: { select: { name: true } } } }, assignee: { select: { name: true } } },
          orderBy: { createdAt: 'asc' },
        });
        return toCsv(
          ['Ticket', 'Project', 'Customer', 'Title', 'Priority', 'Status', 'Under warranty', 'Technician', 'Raised', 'Due', 'Resolved', 'Closed', 'Rating'],
          rows.map((t) => [
            t.code, t.project.code, t.project.customer.name, t.title, t.priority, t.status, t.underWarranty ? 'Yes' : 'No',
            t.assignee?.name, iso(t.createdAt), iso(t.dueAt), iso(t.resolvedAt), iso(t.closedAt), t.csatRating,
          ]),
        );
      }
    }
  }
}

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  @RequirePermissions('report.view')
  summary(@CurrentUser() user: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.summary(user, from, to);
  }

  @Get('export/:kind')
  @RequirePermissions('report.view')
  async export(
    @CurrentUser() user: AuthUser,
    @Param('kind') kind: string,
    @Res({ passthrough: true }) res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (!(EXPORTS as readonly string[]).includes(kind)) throw new BadRequestException('Unknown export');
    const csv = await this.reports.exportCsv(user, kind as ExportKind, from, to);
    const stamp = new Date().toISOString().slice(0, 10);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="udhay-${kind}-${stamp}.csv"`,
    });
    return csv;
  }
}

@Module({ controllers: [ReportsController], providers: [ReportsService] })
export class ReportsModule {}
