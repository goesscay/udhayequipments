/**
 * Compile-time check that the Prisma enums and the shared constants stay identical.
 * If this file fails to compile, update prisma/schema.prisma or packages/shared.
 */
import type { $Enums } from '@prisma/client';
import type { DocumentType, ProjectStatus, Priority, Scope, StageCode, TeamCode } from '@udhay/shared';

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const assert = <T extends true>() => undefined as unknown as T;

export const enumsInSync = [
  assert<Same<$Enums.StageCode, StageCode>>(),
  assert<Same<$Enums.TeamCode, TeamCode>>(),
  assert<Same<$Enums.DocumentType, DocumentType>>(),
  assert<Same<$Enums.Scope, Scope>>(),
  assert<Same<$Enums.ProjectStatus, ProjectStatus>>(),
  assert<Same<$Enums.Priority, Priority>>(),
];
