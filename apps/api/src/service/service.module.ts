import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import {
  OPEN_TICKET_STATUSES,
  PRIORITIES,
  TICKET_STATUSES,
  type Priority,
  type TicketDetail,
  type TicketListItem,
  type TicketStatus,
} from '@udhay/shared';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.module';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { nextCode } from '../common/counter';
import { TicketEvents, type TicketEvent } from '../common/events';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.module';
import { AppRulesService } from '../settings/app-rules.service';

const PHONE = /^[0-9+\-\s]{7,20}$/;

class CreateTicketDto {
  @IsString() projectId: string;
  @IsString() @MinLength(3) @MaxLength(200) title: string;
  @IsString() @MinLength(3) @MaxLength(5000) description: string;
  @IsOptional() @IsIn(PRIORITIES) priority?: Priority;
  @IsOptional() @IsString() @MaxLength(120) contactName?: string;
  @IsOptional() @Matches(PHONE, { message: 'Enter a valid phone number' }) contactPhone?: string;
  @IsOptional() @IsString() assigneeId?: string;
}

class UpdateTicketDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(5000) description?: string;
  @IsOptional() @IsIn(PRIORITIES) priority?: Priority;
  @IsOptional() @IsString() @MaxLength(120) contactName?: string;
  @IsOptional() @IsString() @MaxLength(20) contactPhone?: string;
}

class ListTicketsQuery {
  @IsOptional() @IsIn([...TICKET_STATUSES, 'OPEN_ANY']) status?: TicketStatus | 'OPEN_ANY';
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() mine?: boolean;
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
}

class AssignDto {
  @IsString() userId: string;
}

class VisitDto {
  @IsDateString() visitDate: string;
  @IsString() @MinLength(3) @MaxLength(5000) workDone: string;
  @IsOptional() @IsString() @MaxLength(2000) partsUsed?: string;
}

class ResolveDto {
  @IsString() @MinLength(3) @MaxLength(5000) resolution: string;
}

class CloseDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(5) csatRating?: number;
  @IsOptional() @IsString() @MaxLength(2000) csatComment?: string;
}

const userRef = { select: { id: true, name: true } } as const;
const listInclude = {
  assignee: userRef,
  project: { select: { id: true, code: true, city: true, customer: { select: { name: true } } } },
} satisfies Prisma.ServiceTicketInclude;
type ListRow = Prisma.ServiceTicketGetPayload<{ include: typeof listInclude }>;

function toListItem(t: ListRow): TicketListItem {
  return {
    id: t.id,
    code: t.code,
    title: t.title,
    priority: t.priority,
    status: t.status,
    underWarranty: t.underWarranty,
    dueAt: t.dueAt?.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    assignee: t.assignee,
    project: { id: t.project.id, code: t.project.code, customerName: t.project.customer.name, city: t.project.city },
  };
}

@Injectable()
class ServiceTicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly rules: AppRulesService,
    private readonly events: EventEmitter2,
  ) {}

  /** Service team (or ALL scope) sees every ticket; others see tickets on projects they can see; OWN sees own. */
  ticketWhere(user: AuthUser): Prisma.ServiceTicketWhereInput {
    const scope = this.access.require(user, 'service.view');
    if (scope === 'ALL' || (scope === 'TEAM' && user.team === 'SERVICE')) return {};
    if (scope === 'OWN') return { OR: [{ assigneeId: user.id }, { raisedById: user.id }] };
    return { project: this.access.projectWhere(user) };
  }

  async list(user: AuthUser, q: ListTicketsQuery): Promise<TicketListItem[]> {
    const term = q.search?.trim();
    const rows = await this.prisma.serviceTicket.findMany({
      where: {
        AND: [
          this.ticketWhere(user),
          q.status === 'OPEN_ANY' ? { status: { in: OPEN_TICKET_STATUSES } } : q.status ? { status: q.status } : {},
          q.mine ? { assigneeId: user.id } : {},
          q.projectId ? { projectId: q.projectId } : {},
          term
            ? {
                OR: [
                  { code: { contains: term } },
                  { title: { contains: term } },
                  { project: { code: { contains: term } } },
                  { project: { customer: { name: { contains: term } } } },
                ],
              }
            : {},
        ],
      },
      include: listInclude,
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return rows.map(toListItem);
  }

  async detail(user: AuthUser, id: string): Promise<TicketDetail> {
    const t = await this.prisma.serviceTicket.findFirst({
      where: { AND: [this.ticketWhere(user), { id }] },
      include: {
        ...listInclude,
        raisedBy: userRef,
        visits: { orderBy: { visitDate: 'desc' }, include: { technician: userRef } },
        project: {
          select: { id: true, code: true, city: true, customer: { select: { name: true } }, handover: { select: { warrantyEnd: true } } },
        },
      },
    });
    if (!t) throw new NotFoundException('Ticket not found');
    return {
      ...toListItem(t),
      description: t.description,
      contactName: t.contactName,
      contactPhone: t.contactPhone,
      resolution: t.resolution,
      resolvedAt: t.resolvedAt?.toISOString() ?? null,
      closedAt: t.closedAt?.toISOString() ?? null,
      csatRating: t.csatRating,
      csatComment: t.csatComment,
      raisedBy: t.raisedBy,
      warrantyEnd: t.project.handover?.warrantyEnd.toISOString() ?? null,
      visits: t.visits.map((v) => ({
        id: v.id,
        visitDate: v.visitDate.toISOString(),
        workDone: v.workDone,
        partsUsed: v.partsUsed,
        technician: v.technician,
      })),
      canManage: this.access.canWorkAs(user, 'service.manage', 'SERVICE'),
    };
  }

  async create(user: AuthUser, dto: CreateTicketDto) {
    this.access.requireWorkAs(user, 'service.manage', 'SERVICE');
    const project = await this.access.visibleProject(user, dto.projectId);
    if (project.currentStage !== 'SERVICE' && project.status !== 'COMPLETED') {
      throw new BadRequestException('Service tickets can be raised after the project is handed over');
    }
    if (dto.assigneeId) await this.assertTechnician(dto.assigneeId);

    const [rules, handover] = await Promise.all([
      this.rules.get(),
      this.prisma.handover.findUnique({ where: { projectId: project.id } }),
    ]);
    const priority = dto.priority ?? 'NORMAL';
    const now = new Date();
    const ticket = await this.prisma.$transaction(async (tx) =>
      tx.serviceTicket.create({
        data: {
          code: await nextCode(tx, 'SRV', 'ticket'),
          projectId: project.id,
          title: dto.title.trim(),
          description: dto.description.trim(),
          priority,
          status: dto.assigneeId ? 'ASSIGNED' : 'OPEN',
          underWarranty: !!handover && now <= handover.warrantyEnd,
          contactName: dto.contactName?.trim() || null,
          contactPhone: dto.contactPhone?.trim() || null,
          assigneeId: dto.assigneeId ?? null,
          raisedById: user.id,
          dueAt: new Date(now.getTime() + rules.ticketSlaHours[priority] * 3_600_000),
        },
      }),
    );
    await this.audit.log({ actorId: user.id, entity: 'ticket', entityId: ticket.id, action: 'create', data: { code: ticket.code, projectId: project.id } });
    this.emit(dto.assigneeId ? TicketEvents.ASSIGNED : TicketEvents.CREATED, ticket.id, user.id);
    return { id: ticket.id, code: ticket.code };
  }

  async update(user: AuthUser, id: string, dto: UpdateTicketDto) {
    const t = await this.findManageable(user, id);
    let dueAt: Date | undefined;
    if (dto.priority && dto.priority !== t.priority && OPEN_TICKET_STATUSES.includes(t.status)) {
      const rules = await this.rules.get();
      dueAt = new Date(t.createdAt.getTime() + rules.ticketSlaHours[dto.priority] * 3_600_000);
    }
    await this.prisma.serviceTicket.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        description: dto.description?.trim(),
        priority: dto.priority,
        contactName: dto.contactName === undefined ? undefined : dto.contactName.trim() || null,
        contactPhone: dto.contactPhone === undefined ? undefined : dto.contactPhone.trim() || null,
        ...(dueAt ? { dueAt, slaAlerted: false } : {}),
      },
    });
    await this.audit.log({ actorId: user.id, entity: 'ticket', entityId: id, action: 'update', data: { changed: Object.keys(dto) } });
  }

  async assign(user: AuthUser, id: string, assigneeId: string) {
    const t = await this.findManageable(user, id);
    if (!OPEN_TICKET_STATUSES.includes(t.status)) throw new BadRequestException('Reopen the ticket first');
    await this.assertTechnician(assigneeId);
    await this.prisma.serviceTicket.update({
      where: { id },
      data: { assigneeId, status: t.status === 'OPEN' ? 'ASSIGNED' : t.status },
    });
    await this.audit.log({ actorId: user.id, entity: 'ticket', entityId: id, action: 'assign', data: { assigneeId } });
    this.emit(TicketEvents.ASSIGNED, id, user.id);
  }

  async addVisit(user: AuthUser, id: string, dto: VisitDto) {
    const t = await this.findManageable(user, id);
    if (!OPEN_TICKET_STATUSES.includes(t.status)) throw new BadRequestException('Reopen the ticket to log more visits');
    await this.prisma.$transaction([
      this.prisma.serviceVisit.create({
        data: {
          ticketId: id,
          technicianId: user.id,
          visitDate: new Date(dto.visitDate),
          workDone: dto.workDone.trim(),
          partsUsed: dto.partsUsed?.trim() || null,
        },
      }),
      this.prisma.serviceTicket.update({
        where: { id },
        data: { status: 'IN_PROGRESS', assigneeId: t.assigneeId ?? user.id },
      }),
    ]);
    await this.audit.log({ actorId: user.id, entity: 'ticket', entityId: id, action: 'visit' });
  }

  async resolve(user: AuthUser, id: string, resolution: string) {
    const t = await this.findManageable(user, id);
    if (!OPEN_TICKET_STATUSES.includes(t.status)) throw new BadRequestException('Ticket is already resolved');
    await this.prisma.serviceTicket.update({
      where: { id },
      data: { status: 'RESOLVED', resolution: resolution.trim(), resolvedAt: new Date() },
    });
    await this.audit.log({ actorId: user.id, entity: 'ticket', entityId: id, action: 'resolve' });
  }

  async close(user: AuthUser, id: string, dto: CloseDto) {
    const t = await this.findManageable(user, id);
    if (t.status !== 'RESOLVED') throw new BadRequestException('Resolve the ticket before closing it');
    await this.prisma.serviceTicket.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        csatRating: dto.csatRating ?? null,
        csatComment: dto.csatComment?.trim() || null,
      },
    });
    await this.audit.log({ actorId: user.id, entity: 'ticket', entityId: id, action: 'close', data: { csat: dto.csatRating ?? null } });
  }

  async reopen(user: AuthUser, id: string) {
    const t = await this.findManageable(user, id);
    if (OPEN_TICKET_STATUSES.includes(t.status)) return;
    await this.prisma.serviceTicket.update({
      where: { id },
      data: { status: 'IN_PROGRESS', resolvedAt: null, closedAt: null },
    });
    await this.audit.log({ actorId: user.id, entity: 'ticket', entityId: id, action: 'reopen' });
  }

  private async findManageable(user: AuthUser, id: string) {
    this.access.requireWorkAs(user, 'service.manage', 'SERVICE');
    const t = await this.prisma.serviceTicket.findFirst({ where: { AND: [this.ticketWhere(user), { id }] } });
    if (!t) throw new NotFoundException('Ticket not found');
    if (this.access.scopeOf(user, 'service.manage') === 'OWN' && t.assigneeId && t.assigneeId !== user.id) {
      throw new ForbiddenException('This ticket is assigned to someone else');
    }
    return t;
  }

  private async assertTechnician(userId: string) {
    const u = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true, deletedAt: null },
      include: { team: true },
    });
    if (!u || u.team?.code !== 'SERVICE') throw new BadRequestException('Assign the ticket to a Service team member');
  }

  private emit(event: string, ticketId: string, actorId: string) {
    const payload: TicketEvent = { ticketId, actorId };
    this.events.emit(event, payload);
  }
}

@ApiTags('service')
@ApiBearerAuth()
@Controller('service/tickets')
class ServiceTicketsController {
  constructor(private readonly tickets: ServiceTicketsService) {}

  @Get()
  @RequirePermissions('service.view')
  list(@CurrentUser() user: AuthUser, @Query() q: ListTicketsQuery) {
    return this.tickets.list(user, q);
  }

  @Get(':id')
  @RequirePermissions('service.view')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tickets.detail(user, id);
  }

  @Post()
  @RequirePermissions('service.manage')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTicketDto) {
    return this.tickets.create(user, dto);
  }

  @Patch(':id')
  @HttpCode(204)
  @RequirePermissions('service.manage')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTicketDto) {
    return this.tickets.update(user, id, dto);
  }

  @Post(':id/assign')
  @HttpCode(204)
  @RequirePermissions('service.manage')
  assign(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssignDto) {
    return this.tickets.assign(user, id, dto.userId);
  }

  @Post(':id/visits')
  @HttpCode(204)
  @RequirePermissions('service.manage')
  visit(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: VisitDto) {
    return this.tickets.addVisit(user, id, dto);
  }

  @Post(':id/resolve')
  @HttpCode(204)
  @RequirePermissions('service.manage')
  resolve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ResolveDto) {
    return this.tickets.resolve(user, id, dto.resolution);
  }

  @Post(':id/close')
  @HttpCode(204)
  @RequirePermissions('service.manage')
  close(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CloseDto) {
    return this.tickets.close(user, id, dto);
  }

  @Post(':id/reopen')
  @HttpCode(204)
  @RequirePermissions('service.manage')
  reopen(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tickets.reopen(user, id);
  }
}

@Module({ controllers: [ServiceTicketsController], providers: [ServiceTicketsService] })
export class ServiceModule {}
