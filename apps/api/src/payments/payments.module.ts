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
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { PaymentMilestone, User } from '@prisma/client';
import {
  PAYMENT_KINDS,
  type PaymentKind,
  type PaymentMilestoneItem,
  type PaymentSummary,
} from '@udhay/shared';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.module';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { ProjectEvents, type PaymentReceivedEvent } from '../common/events';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.module';

class CreatePaymentDto {
  @IsIn(PAYMENT_KINDS) kind: PaymentKind;
  @IsString() @MinLength(2) @MaxLength(120) label: string;
  @Type(() => Number) @IsNumber() @Min(0) amount: number;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

class UpdatePaymentDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) label?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

class ReceivePaymentDto {
  @Type(() => Number) @IsNumber() @Min(0) receivedAmount: number;
  @IsOptional() @IsDateString() receivedAt?: string;
  @IsString() @MinLength(2) @MaxLength(30) mode: string;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

class WaiveDto {
  @IsString() @MinLength(3) @MaxLength(2000) reason: string;
}

const num = (d: unknown) => (d == null ? null : Number(d));

function toItem(m: PaymentMilestone & { recordedBy: Pick<User, 'id' | 'name'> | null }): PaymentMilestoneItem {
  return {
    id: m.id,
    kind: m.kind,
    label: m.label,
    amount: Number(m.amount),
    dueDate: m.dueDate?.toISOString() ?? null,
    status: m.status,
    receivedAt: m.receivedAt?.toISOString() ?? null,
    receivedAmount: num(m.receivedAmount),
    mode: m.mode,
    reference: m.reference,
    notes: m.notes,
    recordedBy: m.recordedBy,
  };
}

@Injectable()
class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async summary(user: AuthUser, projectId: string): Promise<PaymentSummary> {
    await this.access.visibleProject(user, projectId);
    const rows = await this.prisma.paymentMilestone.findMany({
      where: { projectId },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      include: { recordedBy: { select: { id: true, name: true } } },
    });
    const milestones = rows.map(toItem);
    const totalPlanned = milestones.filter((m) => m.status !== 'WAIVED').reduce((a, m) => a + m.amount, 0);
    const totalReceived = milestones.reduce((a, m) => a + (m.status === 'RECEIVED' ? m.receivedAmount ?? m.amount : 0), 0);
    return {
      milestones,
      totalPlanned,
      totalReceived,
      outstanding: Math.max(
        0,
        milestones.filter((m) => m.status === 'PENDING').reduce((a, m) => a + m.amount, 0),
      ),
      canManage: !!this.access.scopeOf(user, 'payment.manage'),
    };
  }

  async create(user: AuthUser, projectId: string, dto: CreatePaymentDto) {
    await this.access.visibleProject(user, projectId);
    const m = await this.prisma.paymentMilestone.create({
      data: {
        projectId,
        kind: dto.kind,
        label: dto.label.trim(),
        amount: dto.amount,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        notes: dto.notes?.trim() || null,
        createdById: user.id,
      },
    });
    await this.audit.log({ actorId: user.id, entity: 'payment', entityId: m.id, action: 'create', data: { projectId, kind: m.kind, amount: dto.amount } });
    return m;
  }

  async update(user: AuthUser, id: string, dto: UpdatePaymentDto) {
    const m = await this.find(user, id);
    if (m.status !== 'PENDING') throw new BadRequestException('Only pending milestones can be edited');
    await this.prisma.paymentMilestone.update({
      where: { id },
      data: {
        label: dto.label?.trim(),
        amount: dto.amount,
        dueDate: dto.dueDate === undefined ? undefined : dto.dueDate ? new Date(dto.dueDate) : null,
        notes: dto.notes === undefined ? undefined : dto.notes.trim() || null,
      },
    });
    await this.audit.log({ actorId: user.id, entity: 'payment', entityId: id, action: 'update', data: { changed: Object.keys(dto) } });
  }

  async receive(user: AuthUser, id: string, dto: ReceivePaymentDto) {
    const m = await this.find(user, id);
    if (m.status !== 'PENDING') throw new BadRequestException('This milestone is already settled');
    const receivedAt = dto.receivedAt ? new Date(dto.receivedAt) : new Date();
    if (receivedAt.getTime() > Date.now() + 86_400_000) throw new BadRequestException('Received date cannot be in the future');
    await this.prisma.paymentMilestone.update({
      where: { id },
      data: {
        status: 'RECEIVED',
        receivedAt,
        receivedAmount: dto.receivedAmount,
        mode: dto.mode.trim(),
        reference: dto.reference?.trim() || null,
        notes: dto.notes?.trim() || m.notes,
        recordedById: user.id,
      },
    });
    await this.audit.log({ actorId: user.id, entity: 'payment', entityId: id, action: 'receive', data: { amount: dto.receivedAmount, mode: dto.mode } });
    const event: PaymentReceivedEvent = { projectId: m.projectId, actorId: user.id, label: m.label, amount: dto.receivedAmount };
    this.events.emit(ProjectEvents.PAYMENT_RECEIVED, event);
  }

  async waive(user: AuthUser, id: string, reason: string) {
    const m = await this.find(user, id);
    if (m.status !== 'PENDING') throw new BadRequestException('This milestone is already settled');
    await this.prisma.paymentMilestone.update({
      where: { id },
      data: { status: 'WAIVED', notes: `Waived: ${reason.trim()}`, recordedById: user.id, receivedAt: new Date() },
    });
    await this.audit.log({ actorId: user.id, entity: 'payment', entityId: id, action: 'waive', data: { reason } });
  }

  /** Undo a receipt or waiver entered by mistake. */
  async reopen(user: AuthUser, id: string) {
    const m = await this.find(user, id);
    if (m.status === 'PENDING') return;
    await this.prisma.paymentMilestone.update({
      where: { id },
      data: { status: 'PENDING', receivedAt: null, receivedAmount: null, mode: null, reference: null, recordedById: null },
    });
    await this.audit.log({ actorId: user.id, entity: 'payment', entityId: id, action: 'reopen', data: { previous: m.status } });
  }

  async remove(user: AuthUser, id: string) {
    const m = await this.find(user, id);
    if (m.status !== 'PENDING') throw new BadRequestException('Reopen the milestone before deleting it');
    await this.prisma.paymentMilestone.delete({ where: { id } });
    await this.audit.log({ actorId: user.id, entity: 'payment', entityId: id, action: 'delete', data: { label: m.label, amount: Number(m.amount) } });
  }

  private async find(user: AuthUser, id: string) {
    const m = await this.prisma.paymentMilestone.findUnique({ where: { id } });
    if (!m) throw new NotFoundException('Payment milestone not found');
    await this.access.visibleProject(user, m.projectId);
    return m;
  }
}

@ApiTags('payments')
@ApiBearerAuth()
@Controller()
class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('projects/:id/payments')
  @RequirePermissions('price.view')
  summary(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payments.summary(user, id);
  }

  @Post('projects/:id/payments')
  @RequirePermissions('payment.manage', 'price.view')
  create(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreatePaymentDto) {
    return this.payments.create(user, id, dto);
  }

  @Patch('payments/:id')
  @HttpCode(204)
  @RequirePermissions('payment.manage', 'price.view')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdatePaymentDto) {
    return this.payments.update(user, id, dto);
  }

  @Post('payments/:id/receive')
  @HttpCode(204)
  @RequirePermissions('payment.manage', 'price.view')
  receive(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReceivePaymentDto) {
    return this.payments.receive(user, id, dto);
  }

  @Post('payments/:id/waive')
  @HttpCode(204)
  @RequirePermissions('payment.manage', 'price.view')
  waive(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: WaiveDto) {
    return this.payments.waive(user, id, dto.reason);
  }

  @Post('payments/:id/reopen')
  @HttpCode(204)
  @RequirePermissions('payment.manage', 'price.view')
  reopen(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payments.reopen(user, id);
  }

  @Delete('payments/:id')
  @HttpCode(204)
  @RequirePermissions('payment.manage', 'price.view')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payments.remove(user, id);
  }
}

@Module({ controllers: [PaymentsController], providers: [PaymentsService] })
export class PaymentsModule {}
