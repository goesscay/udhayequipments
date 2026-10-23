import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.module';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser, Db } from '../common/types';
import { PrismaService } from '../prisma/prisma.module';
import { listInclude, toListItem } from '../projects/project.mapper';

const PHONE = /^[0-9+\-\s]{7,20}$/;

export class CreateCustomerDto {
  @IsString() @MinLength(2) @MaxLength(160) name: string;
  @IsOptional() @IsString() @MaxLength(120) contactPerson?: string;
  @Matches(PHONE, { message: 'Enter a valid phone number' }) phone: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(20) gstin?: string;
}

class UpdateCustomerDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(120) contactPerson?: string;
  @IsOptional() @Matches(PHONE, { message: 'Enter a valid phone number' }) phone?: string;
  @IsOptional() @IsString() @MaxLength(160) email?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(20) gstin?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const blankToNull = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null);

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async search(q?: string) {
    const term = q?.trim();
    const rows = await this.prisma.customer.findMany({
      where: {
        deletedAt: null,
        ...(term ? { OR: [{ name: { contains: term } }, { phone: { contains: term } }, { city: { contains: term } }] } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: { _count: { select: { projects: { where: { deletedAt: null } } } } },
    });
    return rows.map(({ _count, ...c }) => ({ ...c, projectCount: _count.projects }));
  }

  /** Customer details plus only the projects this user is allowed to see. */
  async detail(user: AuthUser, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    const projects = await this.prisma.project.findMany({
      where: { AND: [this.access.projectWhere(user), { customerId: id }] },
      include: listInclude,
      orderBy: { createdAt: 'desc' },
    });
    const showPrice = this.access.canSeePrices(user);
    return {
      ...customer,
      canEdit: this.canEdit(user, customer.createdById),
      projects: projects.map((p) => toListItem(p, showPrice)),
    };
  }

  async create(actor: AuthUser, dto: CreateCustomerDto, db: Db = this.prisma) {
    const customer = await db.customer.create({
      data: {
        name: dto.name.trim(),
        contactPerson: dto.contactPerson?.trim() || null,
        phone: dto.phone.trim(),
        email: dto.email?.trim().toLowerCase() || null,
        city: dto.city?.trim() || null,
        address: dto.address?.trim() || null,
        gstin: dto.gstin?.trim().toUpperCase() || null,
        createdById: actor.id,
      },
    });
    await this.audit.log({ actorId: actor.id, entity: 'customer', entityId: customer.id, action: 'create' }, db);
    return customer;
  }

  async update(actor: AuthUser, id: string, dto: UpdateCustomerDto) {
    const customer = await this.prisma.customer.findFirst({ where: { id, deletedAt: null } });
    if (!customer) throw new NotFoundException('Customer not found');
    if (!this.canEdit(actor, customer.createdById)) {
      throw new ForbiddenException('You can only edit customers you created');
    }
    const email = blankToNull(dto.email);
    if (email && !EMAIL.test(email)) throw new BadRequestException('Enter a valid email');

    const updated = await this.prisma.customer.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        contactPerson: blankToNull(dto.contactPerson),
        phone: dto.phone?.trim(),
        email: email === undefined ? undefined : email?.toLowerCase() ?? null,
        city: blankToNull(dto.city),
        address: blankToNull(dto.address),
        gstin: blankToNull(dto.gstin)?.toUpperCase(),
      },
    });
    await this.audit.log({ actorId: actor.id, entity: 'customer', entityId: id, action: 'update', data: { changed: Object.keys(dto) } });
    return updated;
  }

  private canEdit(user: AuthUser, createdById: string) {
    const scope = this.access.scopeOf(user, 'customer.manage');
    if (!scope) return false;
    // TEAM and ALL may edit any customer: customers are shared across teams.
    return scope !== 'OWN' || createdById === user.id;
  }
}

@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermissions('customer.view')
  search(@Query('q') q?: string) {
    return this.customers.search(q);
  }

  @Get(':id')
  @RequirePermissions('customer.view')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customers.detail(user, id);
  }

  @Post()
  @RequirePermissions('customer.manage')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCustomerDto) {
    return this.customers.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions('customer.manage')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(user, id, dto);
  }
}

@Module({ controllers: [CustomersController], providers: [CustomersService], exports: [CustomersService] })
export class CustomersModule {}
