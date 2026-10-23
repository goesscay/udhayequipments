import { Injectable } from '@nestjs/common';
import { STAGE_BY_CODE, type PermissionKey, type Scope, type StageCode, type TeamCode } from '@udhay/shared';
import { PrismaService } from '../prisma/prisma.module';

/** Works out who should hear about something, based on roles, permissions and teams. */
@Injectable()
export class RecipientsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The assignee if there is one; otherwise everyone who can act on the stage. */
  async stageOwners(stage: StageCode, assigneeId: string | null): Promise<string[]> {
    if (assigneeId) return [assigneeId];
    const team = STAGE_BY_CODE[stage].team;
    if (team === 'MANAGEMENT') return this.withPermission('cad.approve');
    return this.withPermission('stage.act', { team });
  }

  /** Heads of the team that owns the stage (users who can assign work within that team). */
  teamHeads(stage: StageCode): Promise<string[]> {
    const team = STAGE_BY_CODE[stage].team;
    if (team === 'MANAGEMENT') return Promise.resolve([]);
    return this.withPermission('stage.assign', { team, scopes: ['TEAM'] });
  }

  /** Members of a team holding a permission (e.g. the Service team for new tickets). */
  teamWith(team: TeamCode, key: PermissionKey): Promise<string[]> {
    return this.withPermission(key, { team });
  }

  /** Admin and Super Admin: anyone who can manage every project. */
  admins(): Promise<string[]> {
    return this.withPermission('project.manage', { scopes: ['ALL'] });
  }

  private async withPermission(
    key: PermissionKey,
    opts: { team?: TeamCode; scopes?: Scope[] } = {},
  ): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...(opts.team ? { team: { code: opts.team } } : {}),
        role: {
          permissions: {
            some: {
              permission: { key },
              ...(opts.scopes ? { scope: { in: opts.scopes } } : {}),
            },
          },
        },
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }
}
