import {
  Controller,
  ForbiddenException,
  Get,
  Global,
  Headers,
  HttpCode,
  Injectable,
  Logger,
  Module,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { timingSafeEqual } from 'node:crypto';
import { Public, RequirePermissions } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.module';

export interface ScheduledTask {
  name: string;
  /** Minimum time between runs. */
  everyMs: number;
  /** How long a run may hold the lock before another instance can take over. */
  leaseMs: number;
  run: () => Promise<Prisma.InputJsonValue>;
}

const TICK_MS = 60_000;

/**
 * Small scheduler for hosts without Redis (e.g. Hostinger shared Node.js hosting).
 * Each task is guarded by a lease row in the JobLock table, so it runs once per interval
 * even with several app instances or a cron calling POST /api/jobs/run at the same time.
 */
@Injectable()
export class JobRunner implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(JobRunner.name);
  private readonly tasks = new Map<string, ScheduledTask>();
  private timers: NodeJS.Timeout[] = [];
  private ticking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  register(task: ScheduledTask) {
    this.tasks.set(task.name, task);
  }

  onApplicationBootstrap() {
    if (this.config.get('JOBS_IN_PROCESS', 'true') === 'false') return;
    const interval = setInterval(() => void this.tick(), TICK_MS);
    const first = setTimeout(() => void this.tick(), 10_000);
    interval.unref();
    first.unref();
    this.timers = [interval, first];
  }

  onModuleDestroy() {
    this.timers.forEach((t) => clearTimeout(t));
  }

  /** Runs every task that is due. Safe to call concurrently from anywhere. */
  async tick(): Promise<Record<string, unknown>> {
    if (this.ticking) return { skipped: 'already running in this process' };
    this.ticking = true;
    const results: Record<string, unknown> = {};
    try {
      for (const task of this.tasks.values()) results[task.name] = await this.runIfDue(task);
    } finally {
      this.ticking = false;
    }
    return results;
  }

  status() {
    return this.prisma.jobLock.findMany({ orderBy: { name: 'asc' } });
  }

  private async runIfDue(task: ScheduledTask) {
    const now = Date.now();
    try {
      await this.prisma.jobLock.upsert({
        where: { name: task.name },
        create: { name: task.name, lockedUntil: new Date(0) },
        update: {},
      });
    } catch (e) {
      // Another instance created the row at the same moment.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
    }

    // A few seconds of slack so a task isn't skipped because ticks drift.
    const dueBefore = new Date(now - task.everyMs + 5_000);
    const claimed = await this.prisma.jobLock.updateMany({
      where: {
        name: task.name,
        lockedUntil: { lt: new Date(now) },
        OR: [{ lastRunAt: null }, { lastRunAt: { lte: dueBefore } }],
      },
      data: { lockedUntil: new Date(now + task.leaseMs), lastRunAt: new Date(now) },
    });
    if (!claimed.count) return 'not due';

    try {
      const result = await task.run();
      await this.prisma.jobLock.update({
        where: { name: task.name },
        data: { lockedUntil: new Date(), lastResult: result, lastError: null },
      });
      return result;
    } catch (e) {
      const message = (e as Error).message;
      this.logger.error(`Job ${task.name} failed: ${message}`);
      await this.prisma.jobLock.update({
        where: { name: task.name },
        data: { lockedUntil: new Date(), lastError: message.slice(0, 5000) },
      });
      return { error: message };
    }
  }
}

@ApiTags('jobs')
@Controller('jobs')
class JobsController {
  constructor(
    private readonly runner: JobRunner,
    private readonly config: ConfigService,
  ) {}

  /** For an hPanel cron job: curl -X POST -H "X-Jobs-Secret: …" https://api.example.com/api/jobs/run */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('run')
  @HttpCode(200)
  run(@Headers('x-jobs-secret') secret?: string) {
    const expected = this.config.get<string>('JOBS_SECRET') ?? '';
    const a = Buffer.from(secret ?? '');
    const b = Buffer.from(expected);
    if (expected.length < 16 || a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException();
    }
    return this.runner.tick();
  }

  @ApiBearerAuth()
  @Get('status')
  @RequirePermissions('settings.manage')
  status() {
    return this.runner.status();
  }
}

@Global()
@Module({ controllers: [JobsController], providers: [JobRunner], exports: [JobRunner] })
export class JobsModule {}
