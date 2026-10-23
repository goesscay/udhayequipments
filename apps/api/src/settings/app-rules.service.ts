import { Injectable } from '@nestjs/common';
import { DEFAULT_RULES, PRIORITIES, type AppRules } from '@udhay/shared';
import { AuditService } from '../audit/audit.module';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.module';

const KEY = 'rules';
const CACHE_MS = 30_000;

/** Business rules stored as one JSON row; missing keys fall back to the defaults. */
@Injectable()
export class AppRulesService {
  private cache: { value: AppRules; at: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<AppRules> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;
    const row = await this.prisma.appSetting.findUnique({ where: { key: KEY } });
    const stored = (row?.value ?? {}) as Partial<AppRules>;
    const value: AppRules = {
      ...DEFAULT_RULES,
      ...stored,
      ticketSlaHours: { ...DEFAULT_RULES.ticketSlaHours, ...(stored.ticketSlaHours ?? {}) },
    };
    this.cache = { value, at: Date.now() };
    return value;
  }

  async update(actor: AuthUser, patch: Partial<AppRules>) {
    const before = await this.get();
    const next: AppRules = {
      ...before,
      ...patch,
      ticketSlaHours: { ...before.ticketSlaHours, ...(patch.ticketSlaHours ?? {}) },
    };
    for (const p of PRIORITIES) next.ticketSlaHours[p] = Math.round(next.ticketSlaHours[p]);

    await this.prisma.appSetting.upsert({
      where: { key: KEY },
      update: { value: next as object },
      create: { key: KEY, value: next as object },
    });
    this.cache = null;
    await this.audit.log({
      actorId: actor.id,
      entity: 'settings',
      entityId: KEY,
      action: 'update',
      data: { before, after: next } as object,
    });
    return next;
  }
}
