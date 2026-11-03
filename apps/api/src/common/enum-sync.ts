/**
 * Compile-time check that the Prisma enums and the shared constants stay identical.
 * If this file fails to compile, update prisma/schema.prisma or packages/shared.
 */
import type { $Enums } from '@prisma/client';
import type {
  DocumentType,
  ItemStatus,
  PaymentKind,
  PaymentStatus,
  Priority,
  ProductionLevel,
  ProjectStatus,
  QcStatus,
  Scope,
  SnagStatus,
  TeamCode,
  TicketStatus,
  TripStatus,
} from '@udhay/shared';

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const assert = <T extends true>() => undefined as unknown as T;

export const enumsInSync = [
  assert<Same<$Enums.TeamCode, TeamCode>>(),
  assert<Same<$Enums.DocumentType, DocumentType>>(),
  assert<Same<$Enums.Scope, Scope>>(),
  assert<Same<$Enums.ProjectStatus, ProjectStatus>>(),
  assert<Same<$Enums.Priority, Priority>>(),
  assert<Same<$Enums.PaymentKind, PaymentKind>>(),
  assert<Same<$Enums.PaymentStatus, PaymentStatus>>(),
  assert<Same<$Enums.ItemStatus, ItemStatus>>(),
  assert<Same<$Enums.QcStatus, QcStatus>>(),
  assert<Same<$Enums.ProductionLevel, ProductionLevel>>(),
  assert<Same<$Enums.TripStatus, TripStatus>>(),
  assert<Same<$Enums.SnagStatus, SnagStatus>>(),
  assert<Same<$Enums.TicketStatus, TicketStatus>>(),
];
