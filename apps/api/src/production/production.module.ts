import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import {
  ITEM_STATUSES,
  PRODUCTION_LEVELS,
  itemProgress,
  type ItemStatus,
  type ProductionItemRow,
  type ProductionLevel,
  type ProductionSummary,
} from '@udhay/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.module';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.module';
import { parseItemLine } from './item-line';

class CreateItemDto {
  @IsString() @MinLength(2) @MaxLength(160) name: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(9999) quantity?: number;
  @IsOptional() @IsString() @MaxLength(4000) spec?: string;
}

class BulkItemsDto {
  /** One item per line; "3 x Sink unit" or "3 Sink unit" sets the quantity. */
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @IsString({ each: true }) @MaxLength(200, { each: true }) lines: string[];
}

class UpdateItemDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) name?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(9999) quantity?: number;
  @IsOptional() @IsString() @MaxLength(4000) spec?: string;
  @IsOptional() @IsIn(ITEM_STATUSES) status?: ItemStatus;
  /** Move the item to this level (Laser & Bending, Fabrication, Welding, Polish). */
  @IsOptional() @IsIn(PRODUCTION_LEVELS) level?: ProductionLevel;
}

class QcDto {
  @IsIn(['PASSED', 'FAILED']) result: 'PASSED' | 'FAILED';
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

const itemInclude = { qcBy: { select: { id: true, name: true } } } satisfies Prisma.ProductionItemInclude;
type ItemRow = Prisma.ProductionItemGetPayload<{ include: typeof itemInclude }>;

function toRow(i: ItemRow): ProductionItemRow {
  return {
    id: i.id,
    name: i.name,
    quantity: i.quantity,
    spec: i.spec,
    status: i.status,
    level: i.level,
    progress: i.progress,
    qcStatus: i.qcStatus,
    qcNotes: i.qcNotes,
    qcBy: i.qcBy,
    qcAt: i.qcAt?.toISOString() ?? null,
  };
}

@Injectable()
class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async summary(user: AuthUser, projectId: string): Promise<ProductionSummary> {
    await this.access.visibleProject(user, projectId);
    const items = await this.prisma.productionItem.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: itemInclude,
    });
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { currentStage: true } });
    const totalQty = items.reduce((a, i) => a + i.quantity, 0);
    const progress = totalQty ? Math.round(items.reduce((a, i) => a + i.progress * i.quantity, 0) / totalQty) : 0;
    const counts: ProductionSummary['counts'] = { NOT_STARTED: 0, LASER_BENDING: 0, FABRICATION: 0, WELDING: 0, POLISH: 0, DONE: 0 };
    for (const i of items) counts[i.status === 'IN_PROGRESS' ? (i.level ?? 'LASER_BENDING') : i.status]++;
    return {
      items: items.map(toRow),
      progress,
      counts,
      readyForQc: items.length > 0 && items.every((i) => i.status === 'DONE'),
      readyForDispatch: items.length > 0 && items.every((i) => i.status === 'DONE' && i.qcStatus === 'PASSED'),
      canManage: this.access.canWorkAs(user, 'production.manage', 'PRODUCTION'),
      canQc: project.currentStage === 'QC' && this.access.canWorkAs(user, 'production.manage', 'QC'),
    };
  }

  async create(user: AuthUser, projectId: string, dto: CreateItemDto) {
    await this.guardProject(user, projectId);
    const sortOrder = await this.nextSort(projectId);
    const item = await this.prisma.productionItem.create({
      data: { projectId, name: dto.name.trim(), quantity: dto.quantity ?? 1, spec: dto.spec?.trim() || null, sortOrder },
    });
    await this.audit.log({ actorId: user.id, entity: 'production_item', entityId: item.id, action: 'create', data: { projectId } });
    return item;
  }

  async bulk(user: AuthUser, projectId: string, lines: string[]) {
    await this.guardProject(user, projectId);
    const parsed = lines.map(parseItemLine).filter((x): x is { name: string; quantity: number } => !!x && x.name.length >= 2);
    if (!parsed.length) throw new BadRequestException('Enter at least one item');
    const start = await this.nextSort(projectId);
    await this.prisma.productionItem.createMany({
      data: parsed.map((p, i) => ({ projectId, name: p.name, quantity: p.quantity, sortOrder: start + i })),
    });
    await this.audit.log({ actorId: user.id, entity: 'project', entityId: projectId, action: 'production_items_bulk', data: { count: parsed.length } });
    return { created: parsed.length };
  }

  async update(user: AuthUser, id: string, dto: UpdateItemDto) {
    const item = await this.find(user, id);
    let status = dto.status ?? item.status;
    let level = item.level;
    // Picking a level puts the item there; Done means it has been through Polish.
    if (dto.level) {
      status = 'IN_PROGRESS';
      level = dto.level;
    } else if (dto.status === 'DONE') level = 'POLISH';
    else if (dto.status === 'NOT_STARTED') level = null;
    else if (dto.status === 'IN_PROGRESS') level = item.level ?? 'LASER_BENDING';
    const progress = itemProgress(status, level);

    const contentChanged = dto.name !== undefined || dto.quantity !== undefined || dto.spec !== undefined;
    // Work that changes after QC must be checked again.
    const resetQc = item.qcStatus === 'PASSED' && (status !== 'DONE' || contentChanged);

    await this.prisma.productionItem.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        quantity: dto.quantity,
        spec: dto.spec === undefined ? undefined : dto.spec.trim() || null,
        status,
        level,
        progress,
        ...(resetQc ? { qcStatus: 'PENDING', qcById: null, qcAt: null } : {}),
      },
    });
    await this.audit.log({ actorId: user.id, entity: 'production_item', entityId: id, action: 'update', data: { status, level, progress, resetQc } });
  }

  async qc(user: AuthUser, id: string, dto: QcDto) {
    const item = await this.prisma.productionItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Item not found');
    this.access.requireWorkAs(user, 'production.manage', 'QC');
    const project = await this.access.visibleProject(user, item.projectId);
    if (project.status !== 'ACTIVE') throw new BadRequestException('Project is not active');
    if (project.currentStage !== 'QC') throw new BadRequestException('Quality checks are done at the QC stage');
    if (dto.result === 'PASSED' && item.status !== 'DONE') {
      throw new BadRequestException('The item has not been through all four levels yet');
    }
    if (dto.result === 'FAILED' && !dto.notes?.trim()) throw new BadRequestException('Say what failed');
    await this.prisma.productionItem.update({
      where: { id },
      data: {
        qcStatus: dto.result,
        qcNotes: dto.notes?.trim() || null,
        qcById: user.id,
        qcAt: new Date(),
        // A failed check sends the item back to work, at the last level (Polish) unless Production moves it.
        ...(dto.result === 'FAILED' ? { status: 'IN_PROGRESS', level: 'POLISH', progress: itemProgress('IN_PROGRESS', 'POLISH') } : {}),
      },
    });
    await this.audit.log({ actorId: user.id, entity: 'production_item', entityId: id, action: `qc_${dto.result.toLowerCase()}`, data: { notes: dto.notes ?? null } });
  }

  async remove(user: AuthUser, id: string) {
    const item = await this.find(user, id);
    await this.prisma.productionItem.delete({ where: { id } });
    await this.audit.log({ actorId: user.id, entity: 'production_item', entityId: id, action: 'delete', data: { name: item.name } });
  }

  private async guardProject(user: AuthUser, projectId: string) {
    this.access.requireWorkAs(user, 'production.manage', 'PRODUCTION');
    const project = await this.access.visibleProject(user, projectId);
    if (project.status !== 'ACTIVE') throw new BadRequestException('Project is not active');
    return project;
  }

  private async find(user: AuthUser, id: string) {
    const item = await this.prisma.productionItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Item not found');
    await this.guardProject(user, item.projectId);
    return item;
  }

  private async nextSort(projectId: string) {
    const last = await this.prisma.productionItem.aggregate({ where: { projectId }, _max: { sortOrder: true } });
    return (last._max.sortOrder ?? -1) + 1;
  }
}

@ApiTags('production')
@ApiBearerAuth()
@Controller()
class ProductionController {
  constructor(private readonly production: ProductionService) {}

  @Get('projects/:id/production')
  @RequirePermissions('project.view')
  summary(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.production.summary(user, id);
  }

  @Post('projects/:id/production/items')
  @RequirePermissions('production.manage')
  create(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateItemDto) {
    return this.production.create(user, id, dto);
  }

  @Post('projects/:id/production/items/bulk')
  @RequirePermissions('production.manage')
  bulk(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: BulkItemsDto) {
    return this.production.bulk(user, id, dto.lines);
  }

  @Patch('production/items/:id')
  @HttpCode(204)
  @RequirePermissions('production.manage')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateItemDto) {
    return this.production.update(user, id, dto);
  }

  @Post('production/items/:id/qc')
  @HttpCode(204)
  @RequirePermissions('production.manage')
  qc(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: QcDto) {
    return this.production.qc(user, id, dto);
  }

  @Delete('production/items/:id')
  @HttpCode(204)
  @RequirePermissions('production.manage')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.production.remove(user, id);
  }
}

@Module({ controllers: [ProductionController], providers: [ProductionService] })
export class ProductionModule {}
