import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  DEFAULT_WORKFLOW,
  EMPTY_WORKFLOW_CONFIG,
  STAGES,
  normaliseWorkflowConfig,
  resolveWorkflow,
  type ResolvedStage,
  type ResolvedWorkflow,
  type StageCode,
  type WorkflowConfig,
} from '@udhay/shared';
import { AuditService } from '../audit/audit.module';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.module';

const KEY = 'workflow';
const RELOAD_MS = 60_000;

/**
 * The workflow as configured in Settings → Workflow, held in memory so permission checks can
 * stay synchronous. Reloaded after every save and once a minute (in case of another instance).
 */
@Injectable()
export class WorkflowConfigService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkflowConfigService.name);
  private config: WorkflowConfig = EMPTY_WORKFLOW_CONFIG;
  private resolved: ResolvedWorkflow = DEFAULT_WORKFLOW;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    // The table may not exist yet on a brand-new database; the periodic reload catches up.
    this.reload().catch((e) => this.logger.warn(`Using the built-in workflow for now: ${(e as Error).message}`));
    this.timer = setInterval(() => this.reload().catch(() => undefined), RELOAD_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  get current(): ResolvedWorkflow {
    return this.resolved;
  }

  stage(code: StageCode): ResolvedStage {
    return this.resolved.stage(code);
  }

  get stored(): WorkflowConfig {
    return this.config;
  }

  async reload() {
    const row = await this.prisma.appSetting.findUnique({ where: { key: KEY } });
    this.apply(normaliseWorkflowConfig(row?.value));
  }

  /** Active and on-hold projects per current stage, so the editor can warn before changes. */
  async usage(): Promise<Partial<Record<StageCode, number>>> {
    const rows = await this.prisma.project.groupBy({
      by: ['currentStage'],
      where: { deletedAt: null, status: { in: ['ACTIVE', 'ON_HOLD'] } },
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map((r) => [r.currentStage, r._count._all]));
  }

  async update(actor: AuthUser, raw: unknown) {
    const before = this.config;
    const next = normaliseWorkflowConfig(raw);
    const nextResolved = resolveWorkflow(next);

    await this.prisma.$transaction(async (tx) => {
      await tx.appSetting.upsert({
        where: { key: KEY },
        update: { value: next as object },
        create: { key: KEY, value: next as object },
      });
      // A stage moved to another team takes its open work with it.
      for (const s of STAGES) {
        const team = nextResolved.stage(s.code).team;
        if (team === this.resolved.stage(s.code).team) continue;
        await tx.project.updateMany({
          where: { currentStage: s.code, status: { in: ['ACTIVE', 'ON_HOLD'] } },
          data: { currentTeam: team },
        });
        await tx.projectStage.updateMany({ where: { stage: s.code, status: 'OPEN' }, data: { team } });
      }
      await this.audit.log(
        { actorId: actor.id, entity: 'settings', entityId: KEY, action: 'update', data: { before, after: next } as object },
        tx,
      );
    });
    this.apply(next);
    return next;
  }

  private apply(config: WorkflowConfig) {
    this.config = config;
    this.resolved = resolveWorkflow(config);
  }
}
