import { BadRequestException, Body, Controller, Get, Global, Injectable, Module, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PRIORITIES, STAGE_CODES, STAGES, type AppRules, type Priority, type StageCode } from '@udhay/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { AuditService } from '../audit/audit.module';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.module';
import { AppRulesService } from './app-rules.service';

class StageSlaDto {
  @IsIn(STAGE_CODES) stage: StageCode;
  /** Up to two years, for stages like Service that run for the warranty period. */
  @IsInt() @Min(1) @Max(17_520) slaHours: number;
}

class UpdateStageSlasDto {
  @IsArray()
  @ArrayMaxSize(STAGE_CODES.length)
  @ValidateNested({ each: true })
  @Type(() => StageSlaDto)
  stages: StageSlaDto[];
}

class TicketSlaDto implements Partial<Record<Priority, number>> {
  @IsOptional() @IsInt() @Min(1) @Max(2_000) URGENT?: number;
  @IsOptional() @IsInt() @Min(1) @Max(2_000) HIGH?: number;
  @IsOptional() @IsInt() @Min(1) @Max(2_000) NORMAL?: number;
  @IsOptional() @IsInt() @Min(1) @Max(2_000) LOW?: number;
}

class UpdateRulesDto {
  @IsOptional() @IsBoolean() advanceBeforeProduction?: boolean;
  @IsOptional() @IsBoolean() preDispatchBeforeDispatch?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(120) defaultWarrantyMonths?: number;
  @IsOptional() @ValidateNested() @Type(() => TicketSlaDto) ticketSlaHours?: TicketSlaDto;
}

@Injectable()
class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async stageSlas() {
    const rows = await this.prisma.stageSetting.findMany();
    const hours = new Map(rows.map((r) => [r.stage, r.slaHours]));
    return STAGES.map((s) => ({
      stage: s.code,
      slaHours: hours.get(s.code) ?? s.slaHours,
      defaultHours: s.slaHours,
    }));
  }

  /** New target times apply to stages opened from now on; open stages keep their due date. */
  async updateStageSlas(actor: AuthUser, dto: UpdateStageSlasDto) {
    const codes = dto.stages.map((s) => s.stage);
    if (new Set(codes).size !== codes.length) throw new BadRequestException('Each stage may appear only once');

    const before = new Map((await this.stageSlas()).map((s) => [s.stage, s.slaHours]));
    const changed = dto.stages.filter((s) => before.get(s.stage) !== s.slaHours);
    if (!changed.length) return this.stageSlas();

    await this.prisma.$transaction(async (tx) => {
      for (const s of changed) {
        await tx.stageSetting.upsert({
          where: { stage: s.stage },
          update: { slaHours: s.slaHours },
          create: { stage: s.stage, slaHours: s.slaHours },
        });
      }
      await this.audit.log(
        {
          actorId: actor.id,
          entity: 'settings',
          entityId: 'stage_sla',
          action: 'update',
          data: changed.map((s) => ({ stage: s.stage, from: before.get(s.stage) ?? null, to: s.slaHours })),
        },
        tx,
      );
    });
    return this.stageSlas();
  }
}

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly rules: AppRulesService,
  ) {}

  @Get('rules')
  @RequirePermissions('settings.manage')
  getRules() {
    return this.rules.get();
  }

  @Put('rules')
  @RequirePermissions('settings.manage')
  updateRules(@CurrentUser() user: AuthUser, @Body() dto: UpdateRulesDto) {
    const patch: Partial<AppRules> = { ...dto, ticketSlaHours: undefined };
    if (dto.ticketSlaHours) {
      patch.ticketSlaHours = Object.fromEntries(
        PRIORITIES.filter((p) => dto.ticketSlaHours![p] != null).map((p) => [p, dto.ticketSlaHours![p]!]),
      ) as AppRules['ticketSlaHours'];
    }
    return this.rules.update(user, patch);
  }

  @Get('stage-slas')
  @RequirePermissions('settings.manage')
  stageSlas() {
    return this.settings.stageSlas();
  }

  @Put('stage-slas')
  @RequirePermissions('settings.manage')
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateStageSlasDto) {
    return this.settings.updateStageSlas(user, dto);
  }
}

@Global()
@Module({ controllers: [SettingsController], providers: [SettingsService, AppRulesService], exports: [AppRulesService] })
export class SettingsModule {}
