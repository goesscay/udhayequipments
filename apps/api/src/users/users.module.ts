import {
  BadRequestException,
  Body,
  ConflictException,
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
import { hash } from '@node-rs/argon2';
import { Prisma } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AuditService } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.module';

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{10,128}$/;
const PASSWORD_MSG = 'Password must be 10+ characters with a letter and a number';

class CreateUserDto {
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsEmail() email: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @Matches(PASSWORD_RULE, { message: PASSWORD_MSG }) password: string;
  @IsString() roleId: string;
  @IsOptional() @IsString() teamId?: string;
}

class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @Matches(PASSWORD_RULE, { message: PASSWORD_MSG }) password?: string;
  @IsOptional() @IsString() roleId?: string;
  @IsOptional() @IsString() teamId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

const userSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  role: { select: { id: true, code: true, name: true } },
  team: { select: { id: true, code: true, name: true } },
} satisfies Prisma.UserSelect;

@Injectable()
class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  list(actor: AuthUser, teamId?: string) {
    const scope = actor.permissions['user.view'];
    const where: Prisma.UserWhereInput = { deletedAt: null, teamId };
    if (scope !== 'ALL') where.teamId = actor.teamId ?? '__none__';
    return this.prisma.user.findMany({ where, select: userSelect, orderBy: { name: 'asc' } });
  }

  async create(actor: AuthUser, dto: CreateUserDto) {
    await this.assertRoleAssignable(actor, dto.roleId);
    try {
      const user = await this.prisma.user.create({
        data: {
          name: dto.name.trim(),
          email: dto.email.trim().toLowerCase(),
          phone: dto.phone?.trim() || null,
          passwordHash: await hash(dto.password),
          roleId: dto.roleId,
          teamId: dto.teamId || null,
        },
        select: userSelect,
      });
      await this.audit.log({ actorId: actor.id, entity: 'user', entityId: user.id, action: 'create', data: { email: user.email, role: user.role.code } });
      return user;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('A user with this email or phone already exists');
      }
      throw e;
    }
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto) {
    const target = await this.prisma.user.findFirst({ where: { id, deletedAt: null }, include: { role: true } });
    if (!target) throw new NotFoundException('User not found');
    if (target.role.code === 'SUPER_ADMIN' && actor.roleCode !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only a Super Admin can edit a Super Admin');
    }
    if (id === actor.id && (dto.isActive === false || dto.roleId)) {
      throw new BadRequestException('You cannot deactivate yourself or change your own role');
    }
    if (dto.roleId) await this.assertRoleAssignable(actor, dto.roleId);

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        phone: dto.phone === undefined ? undefined : dto.phone.trim() || null,
        roleId: dto.roleId,
        teamId: dto.teamId === undefined ? undefined : dto.teamId || null,
        isActive: dto.isActive,
        passwordHash: dto.password ? await hash(dto.password) : undefined,
      },
      select: userSelect,
    });
    if (dto.isActive === false || dto.password) await this.auth.revokeAll(id);

    const changed = Object.keys(dto).filter((k) => k !== 'password');
    await this.audit.log({ actorId: actor.id, entity: 'user', entityId: id, action: 'update', data: { changed, passwordReset: !!dto.password } });
    return user;
  }

  private async assertRoleAssignable(actor: AuthUser, roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new BadRequestException('Unknown role');
    if (role.code === 'SUPER_ADMIN' && actor.roleCode !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Only a Super Admin can grant the Super Admin role');
    }
  }
}

@ApiTags('users')
@ApiBearerAuth()
@Controller()
class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('users')
  @RequirePermissions('user.view')
  list(@CurrentUser() user: AuthUser, @Query('teamId') teamId?: string) {
    return this.users.list(user, teamId);
  }

  @Post('users')
  @RequirePermissions('user.manage')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.users.create(user, dto);
  }

  @Patch('users/:id')
  @RequirePermissions('user.manage')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(user, id, dto);
  }

  @Get('teams')
  teams() {
    return this.prisma.team.findMany({ orderBy: { name: 'asc' } });
  }
}

@Module({ imports: [AuthModule], controllers: [UsersController], providers: [UsersService] })
export class UsersModule {}
