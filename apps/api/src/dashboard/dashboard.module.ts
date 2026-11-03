import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import { OPEN_TICKET_STATUSES, TEAMS, type DashboardSummary } from '@udhay/shared';
import { AccessService } from '../access/access.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.module';
import { WorkflowConfigService } from '../settings/workflow-config.service';
import { listInclude, toListItem } from '../projects/project.mapper';

@Injectable()
class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly workflow: WorkflowConfigService,
  ) {}

  async summary(user: AuthUser): Promise<DashboardSummary> {
    const scoped = this.access.projectWhere(user, 'dashboard.view');
    const showPrice = this.access.canSeePrices(user);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const active: Prisma.ProjectWhereInput = { AND: [scoped, { status: 'ACTIVE' }] };
    const overdue: Prisma.ProjectWhereInput = { AND: [scoped, { status: 'ACTIVE', stageDueAt: { lt: now } }] };
    const count = (extra: Prisma.ProjectWhereInput) =>
      this.prisma.project.count({ where: { AND: [scoped, extra] } });
    const canSeeTickets = !!this.access.scopeOf(user, 'service.view');
    const weekAhead = new Date(now.getTime() + 7 * 86_400_000);

    const [
      activeProjects,
      overdueCount,
      onHold,
      awaitingCustomer,
      inProduction,
      inDispatch,
      pipeline,
      byStage,
      overdueByStage,
      byTeam,
      overdueByTeam,
      overdueRows,
      pendingAcceptance,
      wonThisMonth,
      lostThisMonth,
      activity,
      outstanding,
      openTickets,
      dispatchesNext7Days,
    ] = await Promise.all([
      this.prisma.project.count({ where: active }),
      this.prisma.project.count({ where: overdue }),
      count({ status: 'ON_HOLD' }),
      count({ status: 'ACTIVE', currentStage: { in: ['LAYOUT_APPROVAL', 'CUSTOMER_DECISION'] } }),
      count({ status: 'ACTIVE', currentStage: 'PRODUCTION' }),
      count({ status: 'ACTIVE', currentStage: 'DISPATCH' }),
      showPrice ? this.prisma.project.aggregate({ where: active, _sum: { estimatedValue: true } }) : null,
      this.prisma.project.groupBy({ by: ['currentStage'], where: active, _count: { _all: true } }),
      this.prisma.project.groupBy({ by: ['currentStage'], where: overdue, _count: { _all: true } }),
      this.prisma.project.groupBy({ by: ['currentTeam'], where: active, _count: { _all: true } }),
      this.prisma.project.groupBy({ by: ['currentTeam'], where: overdue, _count: { _all: true } }),
      this.prisma.project.findMany({ where: overdue, include: listInclude, orderBy: { stageDueAt: 'asc' }, take: 10 }),
      this.prisma.projectStage.count({ where: { status: 'OPEN', acceptedAt: null, project: active } }),
      this.prisma.stageTransition.count({ where: { action: 'ACCEPT', createdAt: { gte: monthStart }, project: scoped } }),
      this.prisma.stageTransition.count({ where: { action: 'MARK_LOST', createdAt: { gte: monthStart }, project: scoped } }),
      this.prisma.stageTransition.findMany({
        where: { project: scoped },
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: { project: { select: { code: true } }, byUser: { select: { name: true } } },
      }),
      showPrice
        ? this.prisma.paymentMilestone.aggregate({ where: { status: 'PENDING', project: active }, _sum: { amount: true } })
        : null,
      canSeeTickets
        ? this.prisma.serviceTicket.count({ where: { status: { in: OPEN_TICKET_STATUSES }, project: scoped } })
        : null,
      this.prisma.dispatchTrip.count({
        where: { status: { in: ['PLANNED', 'IN_TRANSIT'] }, plannedDate: { lt: weekAhead }, project: active },
      }),
    ]);

    const stageCount = new Map(byStage.map((r) => [r.currentStage, r._count._all]));
    const stageOverdue = new Map(overdueByStage.map((r) => [r.currentStage, r._count._all]));
    const teamCount = new Map(byTeam.map((r) => [r.currentTeam, r._count._all]));
    const teamOverdue = new Map(overdueByTeam.map((r) => [r.currentTeam, r._count._all]));

    return {
      kpis: {
        activeProjects,
        pipelineValue: pipeline ? Number(pipeline._sum.estimatedValue ?? 0) : null,
        awaitingCustomer,
        overdue: overdueCount,
        inProduction,
        inDispatch,
        onHold,
        pendingAcceptance,
        wonThisMonth,
        lostThisMonth,
        outstandingPayments: outstanding ? Number(outstanding._sum.amount ?? 0) : null,
        openTickets,
        dispatchesNext7Days,
      },
      stageCounts: this.workflow.current.stages.map((s) => ({
        stage: s.code,
        count: stageCount.get(s.code) ?? 0,
        overdue: stageOverdue.get(s.code) ?? 0,
      })),
      teamWorkload: TEAMS.map((t) => ({
        team: t,
        active: teamCount.get(t) ?? 0,
        overdue: teamOverdue.get(t) ?? 0,
      })),
      overdueProjects: overdueRows.map((r) => toListItem(r, showPrice)),
      recentActivity: activity.map((a) => ({
        id: a.id,
        projectId: a.projectId,
        projectCode: a.project.code,
        action: a.action,
        fromStage: a.fromStage,
        toStage: a.toStage,
        by: a.byUser.name,
        createdAt: a.createdAt.toISOString(),
      })),
    };
  }
}

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @RequirePermissions('dashboard.view')
  summary(@CurrentUser() user: AuthUser) {
    return this.dashboard.summary(user);
  }
}

@Module({ controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}
