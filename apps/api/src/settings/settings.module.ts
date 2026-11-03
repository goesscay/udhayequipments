import { BadRequestException, Body, Controller, Delete, Get, Global, Injectable, Module, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PRIORITIES, STAGE_CODES, STAGES, type AppRules, type Priority, type StageCode } from '@udhay/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
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
import { DemoDataService } from './demo-data.service';
import { WorkflowConfigService } from './workflow-config.service';

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

/** Checked field by field by normaliseWorkflowConfig; unknown keys are dropped there. */
class UpdateWorkflowDto {
  @IsObject() stages: Record<string, unknown>;
  @IsObject() transitions: Record<string, unknown>;
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
    private readonly demo: DemoDataService,
    private readonly workflow: WorkflowConfigService,
  ) {}

  @Get('workflow')
  @RequirePermissions('settings.manage')
  async getWorkflow() {
    return { config: this.workflow.stored, activeProjects: await this.workflow.usage() };
  }

  @Put('workflow')
  @RequirePermissions('settings.manage')
  async updateWorkflow(@CurrentUser() user: AuthUser, @Body() dto: UpdateWorkflowDto) {
    const config = await this.workflow.update(user, dto);
    return { config, activeProjects: await this.workflow.usage() };
  }

  @Get('demo-data')
  @RequirePermissions('settings.manage')
  demoStatus() {
    return this.demo.status();
  }

  @Post('demo-data')
  @RequirePermissions('settings.manage')
  loadDemo(@CurrentUser() user: AuthUser) {
    return this.demo.load(user);
  }

  @Delete('demo-data')
  @RequirePermissions('settings.manage')
  removeDemo(@CurrentUser() user: AuthUser) {
    return this.demo.remove(user);
  }

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

/** The configured workflow, readable by everyone signed in so stage names show the same everywhere. */
@ApiTags('settings')
@ApiBearerAuth()
@Controller('workflow')
class WorkflowController {
  constructor(private readonly workflow: WorkflowConfigService) {}

  @Get()
  get() {
    return this.workflow.stored;
  }
}

@Global()
@Module({
  controllers: [SettingsController, WorkflowController],
  providers: [SettingsService, AppRulesService, DemoDataService, WorkflowConfigService],
  exports: [AppRulesService, WorkflowConfigService],
})
export class SettingsModule {}
