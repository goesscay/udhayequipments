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
  EMPLOYMENT_TYPES,
  GENDERS,
  mapDepartment,
  normalizePhone,
  tidyName,
  type UserImportResult,
} from '@udhay/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { AuditService } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AuthService } from '../auth/auth.service';
import { AllowWithTemporaryPassword, CurrentUser, RequirePermissions } from '../common/decorators';
import { temporaryPassword } from '../common/passwords';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.module';

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{10,128}$/;
const PASSWORD_MSG = 'Password must be 10+ characters with a letter and a number';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const blankOr = (v?: string) => v === undefined || v === '';

/** Profile fields shared by create, update and import. Empty strings clear a field. */
class ProfileDto {
  @IsOptional() @IsString() @MaxLength(80) displayName?: string;
  @IsOptional() @IsString() @MaxLength(30) @Matches(/^[A-Za-z0-9_-]*$/, { message: 'Employee code: letters, digits, - and _' }) employeeCode?: string;
  @IsOptional() @ValidateIf((o) => !blankOr(o.email)) @Matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { message: 'Enter a valid email' }) email?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @ValidateIf((o) => !blankOr(o.gender)) @IsIn(GENDERS) gender?: string;
  @IsOptional() @IsString() @MaxLength(80) department?: string;
  @IsOptional() @ValidateIf((o) => !blankOr(o.employmentType)) @IsIn(EMPLOYMENT_TYPES) employmentType?: string;
  @IsOptional() @ValidateIf((o) => !blankOr(o.dateOfJoining)) @Matches(DATE, { message: 'Joining date: yyyy-mm-dd' }) dateOfJoining?: string;
  @IsOptional() @ValidateIf((o) => !blankOr(o.dateOfBirth)) @Matches(DATE, { message: 'Date of birth: yyyy-mm-dd' }) dateOfBirth?: string;
}

class CreateUserDto extends ProfileDto {
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @Matches(PASSWORD_RULE, { message: PASSWORD_MSG }) password: string;
  @IsString() roleId: string;
  @IsOptional() @IsString() teamId?: string;
}

class UpdateUserDto extends ProfileDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @Matches(PASSWORD_RULE, { message: PASSWORD_MSG }) password?: string;
  @IsOptional() @IsString() roleId?: string;
  @IsOptional() @IsString() teamId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class ImportRowDto {
  @IsString() @MinLength(1) @MaxLength(30) employeeCode: string;
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(80) displayName?: string | null;
  @IsOptional() @IsString() @MaxLength(30) phone?: string | null;
  @IsOptional() @IsString() @MaxLength(20) gender?: string | null;
  @IsOptional() @IsString() @MaxLength(80) department?: string | null;
  @IsOptional() @IsString() @MaxLength(30) status?: string | null;
  @IsOptional() @IsString() @MaxLength(30) employmentType?: string | null;
  @IsOptional() @IsString() @MaxLength(10) dateOfJoining?: string | null;
  @IsOptional() @IsString() @MaxLength(10) dateOfBirth?: string | null;
  @IsOptional() @IsString() @MaxLength(160) email?: string | null;
}

class ImportDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => ImportRowDto) rows: ImportRowDto[];
  /** Preview only: check every row and show the mapping without creating anyone. */
  @IsOptional() @IsBoolean() dryRun?: boolean;
}

const userSelect = {
  id: true,
  name: true,
  displayName: true,
  email: true,
  phone: true,
  employeeCode: true,
  gender: true,
  department: true,
  employmentType: true,
  dateOfJoining: true,
  dateOfBirth: true,
  mustChangePassword: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  role: { select: { id: true, code: true, name: true } },
  team: { select: { id: true, code: true, name: true } },
} satisfies Prisma.UserSelect;

const toDate = (v?: string | null) => (v && DATE.test(v) ? new Date(`${v}T00:00:00.000Z`) : null);
const clean = (v?: string | null) => (v == null ? undefined : v.trim() || null);

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
    return this.prisma.user.findMany({ where, select: userSelect, orderBy: [{ employeeCode: 'asc' }, { name: 'asc' }] });
  }

  me(actor: AuthUser) {
    return this.prisma.user.findUniqueOrThrow({ where: { id: actor.id }, select: userSelect });
  }

  async create(actor: AuthUser, dto: CreateUserDto) {
    await this.assertRoleAssignable(actor, dto.roleId);
    const profile = this.profileData(dto);
    if (!profile.email && !profile.employeeCode && !profile.phone) {
      throw new BadRequestException('Give an employee code, mobile number or email so they can sign in');
    }
    try {
      const user = await this.prisma.user.create({
        data: {
          ...profile,
          name: dto.name.trim(),
          passwordHash: await hash(dto.password),
          // An admin-chosen password is temporary: the person sets their own at first sign-in.
          mustChangePassword: true,
          roleId: dto.roleId,
          teamId: dto.teamId || null,
        },
        select: userSelect,
      });
      await this.audit.log({ actorId: actor.id, entity: 'user', entityId: user.id, action: 'create', data: { code: user.employeeCode, role: user.role.code } });
      return user;
    } catch (e) {
      throw this.conflict(e);
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

    const profile = this.profileData(dto);
    // Fields not sent (undefined) keep their current value.
    const next = {
      email: profile.email === undefined ? target.email : profile.email,
      employeeCode: profile.employeeCode === undefined ? target.employeeCode : profile.employeeCode,
      phone: profile.phone === undefined ? target.phone : profile.phone,
    };
    if (!next.email && !next.employeeCode && !next.phone) {
      throw new BadRequestException('Keep at least one of employee code, mobile number or email for signing in');
    }
    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: {
          ...profile,
          name: dto.name?.trim(),
          roleId: dto.roleId,
          teamId: dto.teamId === undefined ? undefined : dto.teamId || null,
          isActive: dto.isActive,
          ...(dto.password ? { passwordHash: await hash(dto.password), mustChangePassword: id !== actor.id } : {}),
        },
        select: userSelect,
      });
      if (dto.isActive === false || dto.password) await this.auth.revokeAll(id);
      const changed = Object.keys(dto).filter((k) => k !== 'password');
      await this.audit.log({ actorId: actor.id, entity: 'user', entityId: id, action: 'update', data: { changed, passwordReset: !!dto.password } });
      return user;
    } catch (e) {
      throw this.conflict(e);
    }
  }

  /**
   * Creates staff from an HR sheet. Department decides team and starting role; each person gets
   * a temporary password that is returned once and must be changed at first sign-in.
   */
  async import(actor: AuthUser, rows: ImportRowDto[], dryRun: boolean): Promise<UserImportResult & { dryRun: boolean }> {
    const [roles, teams, existing] = await Promise.all([
      this.prisma.role.findMany(),
      this.prisma.team.findMany(),
      this.prisma.user.findMany({ select: { employeeCode: true, phone: true, email: true } }),
    ]);
    const roleByCode = new Map(roles.map((r) => [r.code, r]));
    const teamByCode = new Map(teams.map((t) => [t.code, t]));
    const takenCodes = new Set(existing.map((u) => u.employeeCode?.toUpperCase()).filter(Boolean));
    const takenPhones = new Set(existing.map((u) => u.phone).filter(Boolean));
    const takenEmails = new Set(existing.map((u) => u.email).filter(Boolean));

    const result: UserImportResult = { created: [], skipped: [] };
    for (const row of rows) {
      const code = row.employeeCode.trim().toUpperCase();
      const name = tidyName(row.name);
      const skip = (reason: string) => result.skipped.push({ employeeCode: code, name, reason });

      const mapping = mapDepartment(row.department);
      if (!mapping) { skip(`Unknown department "${row.department ?? ''}"`); continue; }
      const role = roleByCode.get(mapping.role);
      if (!role) { skip(`Role ${mapping.role} is missing`); continue; }
      if (role.code === 'SUPER_ADMIN') { skip('Super Admin cannot be imported'); continue; }
      if (takenCodes.has(code)) { skip('Employee code already exists'); continue; }
      const phone = normalizePhone(row.phone);
      if (row.phone && !phone) { skip(`Mobile number "${row.phone}" is not valid`); continue; }
      if (phone && takenPhones.has(phone)) { skip('Mobile number already belongs to another user'); continue; }
      const email = row.email?.trim().toLowerCase() || null;
      if (email && takenEmails.has(email)) { skip('Email already belongs to another user'); continue; }
      const gender = GENDERS.find((g) => g.toLowerCase() === row.gender?.trim().toLowerCase()) ?? null;
      const employmentType = EMPLOYMENT_TYPES.find((t) => t.toLowerCase() === row.employmentType?.trim().toLowerCase()) ?? null;
      const team = mapping.team ? teamByCode.get(mapping.team) ?? null : null;
      const password = temporaryPassword();

      if (!dryRun) {
        try {
          await this.prisma.user.create({
            data: {
              name,
              displayName: row.displayName?.trim() || null,
              employeeCode: code,
              email,
              phone,
              gender,
              department: row.department?.trim() || null,
              employmentType,
              dateOfJoining: toDate(row.dateOfJoining),
              dateOfBirth: toDate(row.dateOfBirth),
              isActive: !/inactive|resigned|left|relieved/i.test(row.status ?? ''),
              passwordHash: await hash(password),
              mustChangePassword: true,
              roleId: role.id,
              teamId: team?.id ?? null,
            },
          });
        } catch (e) {
          skip(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' ? 'Duplicate code, mobile or email' : 'Could not be created');
          continue;
        }
      }
      takenCodes.add(code);
      if (phone) takenPhones.add(phone);
      if (email) takenEmails.add(email);
      result.created.push({
        employeeCode: code,
        name,
        displayName: row.displayName?.trim() || null,
        login: code,
        phone,
        role: role.name,
        team: team?.name ?? null,
        temporaryPassword: dryRun ? '' : password,
      });
    }

    if (!dryRun && result.created.length) {
      await this.audit.log({
        actorId: actor.id,
        entity: 'user',
        entityId: 'import',
        action: 'import',
        data: { created: result.created.map((c) => c.employeeCode), skipped: result.skipped.length },
      });
    }
    return { ...result, dryRun };
  }

  private profileData(dto: ProfileDto) {
    const phone = dto.phone === undefined ? undefined : dto.phone.trim() ? normalizePhone(dto.phone) : null;
    if (dto.phone?.trim() && !phone) throw new BadRequestException('Enter a valid mobile number');
    return {
      displayName: clean(dto.displayName),
      employeeCode: dto.employeeCode === undefined ? undefined : dto.employeeCode.trim().toUpperCase() || null,
      email: dto.email === undefined ? undefined : dto.email.trim().toLowerCase() || null,
      phone,
      gender: clean(dto.gender),
      department: clean(dto.department),
      employmentType: clean(dto.employmentType),
      dateOfJoining: dto.dateOfJoining === undefined ? undefined : toDate(dto.dateOfJoining),
      dateOfBirth: dto.dateOfBirth === undefined ? undefined : toDate(dto.dateOfBirth),
    };
  }

  private conflict(e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const field = String((e.meta?.target as string[] | string | undefined) ?? '');
      if (field.includes('employeeCode')) return new ConflictException('Another user already has this employee code');
      if (field.includes('phone')) return new ConflictException('Another user already has this mobile number');
      return new ConflictException('Another user already has this email');
    }
    return e;
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

  /** The signed-in user's own profile. */
  @Get('users/me')
  @AllowWithTemporaryPassword()
  me(@CurrentUser() user: AuthUser) {
    return this.users.me(user);
  }

  @Post('users')
  @RequirePermissions('user.manage')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateUserDto) {
    return this.users.create(user, dto);
  }

  @Post('users/import')
  @RequirePermissions('user.manage')
  import(@CurrentUser() user: AuthUser, @Body() dto: ImportDto) {
    return this.users.import(user, dto.rows, !!dto.dryRun);
  }

  @Patch('users/:id')
  @RequirePermissions('user.manage')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(user, id, dto);
  }

  /** Active colleagues for @mentions and pickers; available to every signed-in user. */
  @Get('users/directory')
  directory() {
    return this.prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true, displayName: true, team: { select: { code: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  @Get('teams')
  teams() {
    return this.prisma.team.findMany({ orderBy: { name: 'asc' } });
  }
}

@Module({ imports: [AuthModule], controllers: [UsersController], providers: [UsersService] })
export class UsersModule {}
