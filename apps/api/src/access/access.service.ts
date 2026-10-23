import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  STAGE_BY_CODE,
  type PermissionKey,
  type Scope,
  type SessionUser,
  type StageCode,
  type TeamCode,
  type TransitionDef,
} from '@udhay/shared';
import { PrismaService } from '../prisma/prisma.module';
import type { AuthUser } from '../common/types';

interface StageContext {
  currentStage: StageCode;
  salesOwnerId: string;
  openStage: { assigneeId: string | null } | null;
}

/** Central place for "who can see / do what". Services call this; controllers stay thin. */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async loadAuthUser(id: string): Promise<AuthUser | null> {
    const u = await this.prisma.user.findFirst({
      where: { id, isActive: true, deletedAt: null },
      include: {
        team: true,
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });
    if (!u) return null;
    const permissions: AuthUser['permissions'] = {};
    for (const rp of u.role.permissions) {
      permissions[rp.permission.key as PermissionKey] = rp.scope;
    }
    return {
      id: u.id,
      name: u.name,
      displayName: u.displayName,
      email: u.email,
      employeeCode: u.employeeCode,
      mustChangePassword: u.mustChangePassword,
      roleCode: u.role.code,
      roleName: u.role.name,
      teamId: u.teamId,
      team: u.team?.code ?? null,
      teamName: u.team?.name ?? null,
      permissions,
    };
  }

  toSession(user: AuthUser): SessionUser {
    return {
      id: user.id,
      name: user.name,
      displayName: user.displayName,
      email: user.email,
      employeeCode: user.employeeCode,
      mustChangePassword: user.mustChangePassword,
      role: { code: user.roleCode, name: user.roleName },
      team:
        user.teamId && user.team
          ? { id: user.teamId, code: user.team, name: user.teamName ?? user.team }
          : null,
      permissions: user.permissions,
    };
  }

  scopeOf(user: AuthUser, permission: PermissionKey): Scope | null {
    return user.permissions[permission] ?? null;
  }

  require(user: AuthUser, permission: PermissionKey): Scope {
    const scope = this.scopeOf(user, permission);
    if (!scope) throw new ForbiddenException('You do not have permission to do this');
    return scope;
  }

  /** Prisma filter limiting projects to what this user may see under the given permission. */
  projectWhere(user: AuthUser, permission: PermissionKey = 'project.view'): Prisma.ProjectWhereInput {
    const scope = this.require(user, permission);
    const base: Prisma.ProjectWhereInput = { deletedAt: null };
    if (scope === 'ALL') return base;

    const mine: Prisma.ProjectWhereInput[] = [
      { salesOwnerId: user.id },
      { createdById: user.id },
      { stages: { some: { assigneeId: user.id } } },
    ];
    if (scope === 'OWN' || !user.team) return { ...base, OR: mine };

    // TEAM: anything my team holds now or has worked on before.
    return {
      ...base,
      OR: [...mine, { currentTeam: user.team }, { stages: { some: { team: user.team } } }],
    };
  }

  canPerformTransition(user: AuthUser, t: TransitionDef, ctx: StageContext): boolean {
    const scope = this.scopeOf(user, t.permission);
    if (!scope) return false;
    if (!t.teamBound || scope === 'ALL') return true;

    const stageTeam = STAGE_BY_CODE[ctx.currentStage].team;
    if (user.team !== stageTeam) return false;
    if (scope === 'TEAM') return true;

    // OWN: only the person holding the stage (sales owner for Sales stages).
    if (ctx.openStage?.assigneeId === user.id) return true;
    return stageTeam === 'SALES' && ctx.salesOwnerId === user.id;
  }

  /** Can this user pick up (accept) the open stage? */
  canAccept(user: AuthUser, ctx: StageContext): boolean {
    const def = STAGE_BY_CODE[ctx.currentStage];
    if (def.code === 'HEAD_APPROVAL') return !!this.scopeOf(user, 'cad.approve');
    const scope = this.scopeOf(user, 'stage.act');
    if (!scope) return false;
    if (scope === 'ALL') return true;
    if (user.team !== def.team) return false;
    return scope === 'TEAM' || !ctx.openStage?.assigneeId || ctx.openStage.assigneeId === user.id;
  }

  canSeePrices(user: AuthUser): boolean {
    return !!this.scopeOf(user, 'price.view');
  }

  /**
   * For team-owned modules (production, dispatch, installation, service): ALL works anywhere,
   * TEAM/OWN only for members of the owning team.
   */
  canWorkAs(user: AuthUser, permission: PermissionKey, team: TeamCode): boolean {
    const scope = this.scopeOf(user, permission);
    if (!scope) return false;
    return scope === 'ALL' || user.team === team;
  }

  requireWorkAs(user: AuthUser, permission: PermissionKey, team: TeamCode) {
    if (!this.canWorkAs(user, permission, team)) {
      throw new ForbiddenException('Only the responsible team can do this');
    }
  }

  /** Loads a project the user may see, or 404s (never reveals that it exists). */
  async visibleProject(user: AuthUser, projectId: string, permission: PermissionKey = 'project.view') {
    const project = await this.prisma.project.findFirst({
      where: { AND: [this.projectWhere(user, permission), { id: projectId }] },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }
}
