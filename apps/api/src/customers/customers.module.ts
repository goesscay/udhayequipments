import { Body, Controller, Get, Injectable, Module, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AuditService } from '../audit/audit.module';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser, Db } from '../common/types';
import { PrismaService } from '../prisma/prisma.module';

export class CreateCustomerDto {
  @IsString() @MinLength(2) @MaxLength(160) name: string;
  @IsOptional() @IsString() @MaxLength(120) contactPerson?: string;
  @Matches(/^[0-9+\-\s]{7,20}$/, { message: 'Enter a valid phone number' }) phone: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(20) gstin?: string;
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  search(q?: string) {
    const term = q?.trim();
    return this.prisma.customer.findMany({
      where: {
        deletedAt: null,
        ...(term ? { OR: [{ name: { contains: term } }, { phone: { contains: term } }, { city: { contains: term } }] } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
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

  @Post()
  @RequirePermissions('customer.manage')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCustomerDto) {
    return this.customers.create(user, dto);
  }
}

@Module({ controllers: [CustomersController], providers: [CustomersService], exports: [CustomersService] })
export class CustomersModule {}
