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
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PERMISSION_KEYS, SCOPES, type PermissionKey, type Scope } from '@udhay/shared';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { AuditService } from '../audit/audit.module';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.module';

class GrantDto {
  @IsIn(PERMISSION_KEYS) key: PermissionKey;
  @IsIn(SCOPES) scope: Scope;
}

class SetPermissionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GrantDto)
  permissions: GrantDto[];
}

class CreateRoleDto {
  @Matches(/^[A-Z][A-Z0-9_]{2,39}$/, { message: 'Code must be UPPER_SNAKE_CASE' }) code: string;
  @IsString() @MaxLength(80) name: string;
  @IsOptional() @IsString() @MaxLength(255) description?: string;
}

@Injectable()
class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const roles = await this.prisma.role.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
    });
    return roles.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      userCount: r._count.users,
      permissions: r.permissions.map((p) => ({ key: p.permission.key, scope: p.scope })),
    }));
  }

  async create(actor: AuthUser, dto: CreateRoleDto) {
    const exists = await this.prisma.role.findUnique({ where: { code: dto.code } });
    if (exists) throw new ConflictException('Role code already exists');
    const role = await this.prisma.role.create({ data: { ...dto, isSystem: false } });
    await this.audit.log({ actorId: actor.id, entity: 'role', entityId: role.id, action: 'create', data: { code: role.code } });
    return role;
  }

  async setPermissions(actor: AuthUser, roleId: string, dto: SetPermissionsDto) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.code === 'SUPER_ADMIN') throw new ForbiddenException('The Super Admin role always has full access');
    const keys = dto.permissions.map((p) => p.key);
    if (new Set(keys).size !== keys.length) throw new BadRequestException('Duplicate permission keys');

    const perms = await this.prisma.permission.findMany({ where: { key: { in: keys } } });
    const idByKey = new Map(perms.map((p) => [p.key, p.id]));

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      await tx.rolePermission.createMany({
        data: dto.permissions.map((p) => ({ roleId, permissionId: idByKey.get(p.key)!, scope: p.scope })),
      });
      await this.audit.log(
        { actorId: actor.id, entity: 'role', entityId: roleId, action: 'set_permissions', data: dto.permissions.map((p) => `${p.key}:${p.scope}`) },
        tx,
      );
    });
    return (await this.list()).find((r) => r.id === roleId);
  }
}

@ApiTags('roles')
@ApiBearerAuth()
@Controller()
class RolesController {
  constructor(
    private readonly roles: RolesService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('roles')
  @RequirePermissions('user.view')
  list() {
    return this.roles.list();
  }

  @Post('roles')
  @RequirePermissions('role.manage')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRoleDto) {
    return this.roles.create(user, dto);
  }

  @Put('roles/:id/permissions')
  @RequirePermissions('role.manage')
  setPermissions(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetPermissionsDto) {
    return this.roles.setPermissions(user, id, dto);
  }

  @Get('permissions')
  @RequirePermissions('role.manage')
  permissions() {
    return this.prisma.permission.findMany({ orderBy: { key: 'asc' } });
  }
}

@Module({ controllers: [RolesController], providers: [RolesService] })
export class RolesModule {}
