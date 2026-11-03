import { hash } from '@node-rs/argon2';
import type { PrismaClient } from '@prisma/client';
import {
  DEFAULT_ROLES,
  PERMISSIONS,
  PERMISSION_KEYS,
  ROLE_CODES,
  STAGES,
  TEAMS,
  TEAM_LABELS,
  type RoleCode,
  type TeamCode,
} from '@udhay/shared';

export interface SeedOptions {
  /** Created only if no user with this email exists yet. */
  superAdmin?: { email: string; password: string };
  demoUsers?: { password: string };
  log?: (msg: string) => void;
}

/**
 * Idempotent reference data: teams, permissions, system roles, stage SLAs, plus optional users.
 * Safe to run on every start: roles edited by the Super Admin are kept (SUPER_ADMIN is always reset
 * to every permission) and SLA hours already in the database are not overwritten.
 */
export async function runSeed(prisma: PrismaClient, opts: SeedOptions = {}) {
  const log = opts.log ?? console.log;

  for (const code of TEAMS) {
    await prisma.team.upsert({
      where: { code },
      update: { name: TEAM_LABELS[code] },
      create: { code, name: TEAM_LABELS[code] },
    });
  }

  // Permissions added by a release are granted to existing system roles below, so new features
  // work for the department roles without overwriting what the Super Admin changed on older ones.
  const knownKeys = new Set((await prisma.permission.findMany({ select: { key: true } })).map((p) => p.key));
  const newKeys = PERMISSION_KEYS.filter((k) => !knownKeys.has(k));

  for (const key of PERMISSION_KEYS) {
    await prisma.permission.upsert({
      where: { key },
      update: { description: PERMISSIONS[key] },
      create: { key, description: PERMISSIONS[key] },
    });
  }
  const permissions = await prisma.permission.findMany();
  const permId = new Map(permissions.map((p) => [p.key, p.id]));

  for (const code of ROLE_CODES) {
    const def = DEFAULT_ROLES[code];
    const existing = await prisma.role.findUnique({ where: { code } });
    if (existing && code !== 'SUPER_ADMIN') {
      const grants = newKeys.filter((k) => def.permissions[k]);
      if (knownKeys.size && grants.length) {
        await prisma.rolePermission.createMany({
          data: grants.map((k) => ({ roleId: existing.id, permissionId: permId.get(k)!, scope: def.permissions[k]! })),
          skipDuplicates: true,
        });
        log(`Granted new permissions to ${code}: ${grants.join(', ')}`);
      }
      continue;
    }
    const role = await prisma.role.upsert({
      where: { code },
      update: { name: def.name, description: def.description, isSystem: true },
      create: { code, name: def.name, description: def.description, isSystem: true },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: Object.entries(def.permissions).map(([key, scope]) => ({
        roleId: role.id,
        permissionId: permId.get(key)!,
        scope: scope!,
      })),
    });
  }

  for (const s of STAGES) {
    await prisma.stageSetting.upsert({
      where: { stage: s.code },
      update: {},
      create: { stage: s.code, slaHours: s.slaHours },
    });
  }

  const createUser = async (name: string, email: string, password: string, role: RoleCode, team: TeamCode) => {
    email = email.trim().toLowerCase();
    if (await prisma.user.findUnique({ where: { email } })) return;
    const [roleRow, teamRow] = await Promise.all([
      prisma.role.findUniqueOrThrow({ where: { code: role } }),
      prisma.team.findUniqueOrThrow({ where: { code: team } }),
    ]);
    await prisma.user.create({
      data: { name, email, passwordHash: await hash(password), roleId: roleRow.id, teamId: teamRow.id },
    });
    log(`Created ${role} user ${email}`);
  };

  if (opts.superAdmin) {
    await createUser('Super Admin', opts.superAdmin.email, opts.superAdmin.password, 'SUPER_ADMIN', 'MANAGEMENT');
  }

  if (opts.demoUsers) {
    const demo: [string, string, RoleCode, TeamCode][] = [
      ['Office Admin', 'admin@udhay.local', 'ADMIN', 'MANAGEMENT'],
      ['Operations Executive', 'operations@udhay.local', 'OPERATIONS', 'OPERATIONS'],
      ['Sales Executive', 'sales@udhay.local', 'SALES', 'SALES'],
      ['Project Engineer', 'project@udhay.local', 'PROJECT', 'PROJECT'],
      ['CAD Draftsman', 'cad@udhay.local', 'CAD', 'CAD'],
      ['Production Supervisor', 'production@udhay.local', 'ADMIN', 'PRODUCTION'],
      ['Dispatch Coordinator', 'dispatch@udhay.local', 'ADMIN', 'DISPATCH'],
      ['Service Technician', 'service@udhay.local', 'SERVICE', 'SERVICE'],
    ];
    for (const [name, mail, role, team] of demo) {
      await createUser(name, mail, opts.demoUsers.password, role, team);
    }
  }
}

/** Reads seed options from environment variables (shared by the CLI seed and the boot step). */
export function seedOptionsFromEnv(env: NodeJS.ProcessEnv): SeedOptions {
  const email = env.SEED_SUPERADMIN_EMAIL;
  const password = env.SEED_SUPERADMIN_PASSWORD;
  return {
    superAdmin: email && password ? { email, password } : undefined,
    demoUsers:
      env.SEED_DEMO_USERS === 'true' && env.SEED_DEMO_PASSWORD
        ? { password: env.SEED_DEMO_PASSWORD }
        : undefined,
  };
}
