import {
  BadRequestException,
  Body,
  Controller,
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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { DispatchTrip } from '@prisma/client';
import type { DispatchBoardTrip, DispatchTripRow } from '@udhay/shared';
import { IsDateString, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.module';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.module';
import { GatesService } from '../projects/gates.service';
import { ProjectsModule } from '../projects/projects.module';

const PHONE = /^[0-9+\-\s]{7,20}$/;

class TripDto {
  @IsDateString() plannedDate: string;
  @IsOptional() @IsString() @MaxLength(30) vehicleNo?: string;
  @IsOptional() @IsString() @MaxLength(120) driverName?: string;
  @IsOptional() @Matches(PHONE, { message: 'Enter a valid phone number' }) driverPhone?: string;
  @IsOptional() @IsString() @MaxLength(60) challanNo?: string;
  @IsOptional() @IsString() @MaxLength(60) ewayBillNo?: string;
  @IsOptional() @IsString() @MaxLength(4000) itemsNote?: string;
}

class UpdateTripDto {
  @IsOptional() @IsDateString() plannedDate?: string;
  @IsOptional() @IsString() @MaxLength(30) vehicleNo?: string;
  @IsOptional() @IsString() @MaxLength(120) driverName?: string;
  @IsOptional() @IsString() @MaxLength(20) driverPhone?: string;
  @IsOptional() @IsString() @MaxLength(60) challanNo?: string;
  @IsOptional() @IsString() @MaxLength(60) ewayBillNo?: string;
  @IsOptional() @IsString() @MaxLength(4000) itemsNote?: string;
}

class DeliverDto {
  @IsString() @MinLength(2) @MaxLength(120) receivedByName: string;
  /** Signature image or delivery photo uploaded as a POD document. */
  @IsString() podDocumentId: string;
}

const blank = (v?: string) => (v === undefined ? undefined : v.trim() || null);

function toRow(t: DispatchTrip): DispatchTripRow {
  return {
    id: t.id,
    tripNo: t.tripNo,
    plannedDate: t.plannedDate.toISOString(),
    vehicleNo: t.vehicleNo,
    driverName: t.driverName,
    driverPhone: t.driverPhone,
    challanNo: t.challanNo,
    ewayBillNo: t.ewayBillNo,
    itemsNote: t.itemsNote,
    status: t.status,
    dispatchedAt: t.dispatchedAt?.toISOString() ?? null,
    deliveredAt: t.deliveredAt?.toISOString() ?? null,
    receivedByName: t.receivedByName,
    podDocumentId: t.podDocumentId,
  };
}

@Injectable()
class DispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly gates: GatesService,
  ) {}

  async forProject(user: AuthUser, projectId: string) {
    const project = await this.access.visibleProject(user, projectId);
    const trips = await this.prisma.dispatchTrip.findMany({ where: { projectId }, orderBy: { tripNo: 'asc' } });
    return {
      trips: trips.map(toRow),
      canManage: this.access.canWorkAs(user, 'dispatch.manage', 'DISPATCH'),
      canDispatchNow: project.currentStage === 'DISPATCH' && project.status === 'ACTIVE',
      dispatchBlocker: await this.gates.dispatchBlocker(this.prisma, projectId),
    };
  }

  /** Trips in a date window plus anything still open from before it, across visible projects. */
  async board(user: AuthUser, from?: string, to?: string): Promise<DispatchBoardTrip[]> {
    const start = from ? new Date(from) : startOfDay(new Date());
    const end = to ? new Date(to) : new Date(start.getTime() + 14 * 86_400_000);
    const trips = await this.prisma.dispatchTrip.findMany({
      where: {
        project: this.access.projectWhere(user),
        OR: [
          { plannedDate: { gte: start, lt: end } },
          { status: { in: ['PLANNED', 'IN_TRANSIT'] }, plannedDate: { lt: start } },
        ],
      },
      include: { project: { include: { customer: { select: { name: true } } } } },
      orderBy: [{ plannedDate: 'asc' }, { tripNo: 'asc' }],
      take: 300,
    });
    return trips.map((t) => ({
      ...toRow(t),
      project: {
        id: t.project.id,
        code: t.project.code,
        title: t.project.title,
        customerName: t.project.customer.name,
        city: t.project.city,
        siteAddress: t.project.siteAddress,
      },
    }));
  }

  async create(user: AuthUser, projectId: string, dto: TripDto) {
    this.access.requireWorkAs(user, 'dispatch.manage', 'DISPATCH');
    const project = await this.access.visibleProject(user, projectId);
    if (project.status !== 'ACTIVE') throw new BadRequestException('Project is not active');
    const trip = await this.prisma.$transaction(async (tx) => {
      const last = await tx.dispatchTrip.aggregate({ where: { projectId }, _max: { tripNo: true } });
      return tx.dispatchTrip.create({
        data: {
          projectId,
          tripNo: (last._max.tripNo ?? 0) + 1,
          plannedDate: new Date(dto.plannedDate),
          vehicleNo: blank(dto.vehicleNo)?.toUpperCase() ?? null,
          driverName: blank(dto.driverName) ?? null,
          driverPhone: blank(dto.driverPhone) ?? null,
          challanNo: blank(dto.challanNo) ?? null,
          ewayBillNo: blank(dto.ewayBillNo) ?? null,
          itemsNote: blank(dto.itemsNote) ?? null,
          createdById: user.id,
        },
      });
    });
    await this.audit.log({ actorId: user.id, entity: 'dispatch_trip', entityId: trip.id, action: 'create', data: { projectId, tripNo: trip.tripNo } });
    return toRow(trip);
  }

  async update(user: AuthUser, id: string, dto: UpdateTripDto) {
    const trip = await this.find(user, id);
    if (trip.status === 'DELIVERED' || trip.status === 'CANCELLED') throw new BadRequestException('This trip is closed');
    await this.prisma.dispatchTrip.update({
      where: { id },
      data: {
        plannedDate: dto.plannedDate ? new Date(dto.plannedDate) : undefined,
        vehicleNo: blank(dto.vehicleNo)?.toUpperCase() ?? (dto.vehicleNo === undefined ? undefined : null),
        driverName: blank(dto.driverName),
        driverPhone: blank(dto.driverPhone),
        challanNo: blank(dto.challanNo),
        ewayBillNo: blank(dto.ewayBillNo),
        itemsNote: blank(dto.itemsNote),
      },
    });
    await this.audit.log({ actorId: user.id, entity: 'dispatch_trip', entityId: id, action: 'update', data: { changed: Object.keys(dto) } });
  }

  async dispatch(user: AuthUser, id: string) {
    const trip = await this.find(user, id);
    if (trip.status !== 'PLANNED') throw new BadRequestException('Only planned trips can be dispatched');
    const project = await this.prisma.project.findUniqueOrThrow({ where: { id: trip.projectId } });
    if (project.currentStage !== 'DISPATCH' || project.status !== 'ACTIVE') {
      throw new BadRequestException('Production must be completed before goods leave');
    }
    const blocker = await this.gates.dispatchBlocker(this.prisma, trip.projectId);
    if (blocker) throw new BadRequestException(blocker);
    await this.prisma.dispatchTrip.update({ where: { id }, data: { status: 'IN_TRANSIT', dispatchedAt: new Date() } });
    await this.audit.log({ actorId: user.id, entity: 'dispatch_trip', entityId: id, action: 'dispatch' });
  }

  async deliver(user: AuthUser, id: string, dto: DeliverDto) {
    const trip = await this.find(user, id);
    if (trip.status !== 'IN_TRANSIT') throw new BadRequestException('Mark the trip as dispatched first');
    const doc = await this.prisma.document.findFirst({
      where: { id: dto.podDocumentId, projectId: trip.projectId, type: 'POD', deletedAt: null },
    });
    if (!doc) throw new BadRequestException('Attach the signature or delivery photo first');
    await this.prisma.dispatchTrip.update({
      where: { id },
      data: { status: 'DELIVERED', deliveredAt: new Date(), receivedByName: dto.receivedByName.trim(), podDocumentId: doc.id },
    });
    await this.audit.log({ actorId: user.id, entity: 'dispatch_trip', entityId: id, action: 'deliver', data: { receivedBy: dto.receivedByName } });
  }

  async cancel(user: AuthUser, id: string) {
    const trip = await this.find(user, id);
    if (trip.status === 'DELIVERED') throw new BadRequestException('A delivered trip cannot be cancelled');
    await this.prisma.dispatchTrip.update({ where: { id }, data: { status: 'CANCELLED' } });
    await this.audit.log({ actorId: user.id, entity: 'dispatch_trip', entityId: id, action: 'cancel' });
  }

  private async find(user: AuthUser, id: string) {
    this.access.requireWorkAs(user, 'dispatch.manage', 'DISPATCH');
    const trip = await this.prisma.dispatchTrip.findUnique({ where: { id } });
    if (!trip) throw new NotFoundException('Trip not found');
    await this.access.visibleProject(user, trip.projectId);
    return trip;
  }
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

@ApiTags('dispatch')
@ApiBearerAuth()
@Controller()
class DispatchController {
  constructor(private readonly dispatch: DispatchService) {}

  @Get('dispatch/board')
  @RequirePermissions('project.view')
  board(@CurrentUser() user: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.dispatch.board(user, from, to);
  }

  @Get('projects/:id/dispatch')
  @RequirePermissions('project.view')
  forProject(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.dispatch.forProject(user, id);
  }

  @Post('projects/:id/dispatch/trips')
  @RequirePermissions('dispatch.manage')
  create(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TripDto) {
    return this.dispatch.create(user, id, dto);
  }

  @Patch('dispatch/trips/:id')
  @HttpCode(204)
  @RequirePermissions('dispatch.manage')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTripDto) {
    return this.dispatch.update(user, id, dto);
  }

  @Post('dispatch/trips/:id/dispatch')
  @HttpCode(204)
  @RequirePermissions('dispatch.manage')
  markDispatched(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.dispatch.dispatch(user, id);
  }

  @Post('dispatch/trips/:id/deliver')
  @HttpCode(204)
  @RequirePermissions('dispatch.manage')
  deliver(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DeliverDto) {
    return this.dispatch.deliver(user, id, dto);
  }

  @Post('dispatch/trips/:id/cancel')
  @HttpCode(204)
  @RequirePermissions('dispatch.manage')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.dispatch.cancel(user, id);
  }
}

@Module({ imports: [ProjectsModule], controllers: [DispatchController], providers: [DispatchService] })
export class DispatchModule {}
