import type { PermissionKey, Scope, TeamCode } from '@udhay/shared';
import type { Prisma, PrismaClient } from '@prisma/client';

export interface AuthUser {
  id: string;
  name: string;
  displayName: string | null;
  email: string | null;
  employeeCode: string | null;
  mustChangePassword: boolean;
  roleCode: string;
  roleName: string;
  teamId: string | null;
  team: TeamCode | null;
  teamName: string | null;
  permissions: Partial<Record<PermissionKey, Scope>>;
}

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

/** Either the root client or an interactive-transaction client. */
export type Db = PrismaClient | Prisma.TransactionClient;
