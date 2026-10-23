import type { Prisma } from '@prisma/client';
import type { ProjectListItem } from '@udhay/shared';

const userRef = { select: { id: true, name: true } } as const;

export const listInclude = {
  customer: { select: { id: true, name: true } },
  salesOwner: userRef,
  stages: {
    where: { status: 'OPEN' },
    orderBy: { startedAt: 'desc' },
    take: 1,
    include: { assignee: userRef },
  },
} satisfies Prisma.ProjectInclude;

export type ListRow = Prisma.ProjectGetPayload<{ include: typeof listInclude }>;

export const detailInclude = {
  customer: true,
  salesOwner: userRef,
  stages: { orderBy: { startedAt: 'asc' }, include: { assignee: userRef } },
  transitions: { orderBy: { createdAt: 'desc' }, take: 200, include: { byUser: userRef } },
  documents: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    include: { uploadedBy: userRef },
  },
  comments: { orderBy: { createdAt: 'desc' }, take: 200, include: { author: userRef } },
} satisfies Prisma.ProjectInclude;

export type DetailRow = Prisma.ProjectGetPayload<{ include: typeof detailInclude }>;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function toListItem(p: ListRow, showPrice: boolean): ProjectListItem {
  const open = p.stages[0];
  return {
    id: p.id,
    code: p.code,
    title: p.title,
    customer: p.customer,
    city: p.city,
    status: p.status,
    priority: p.priority,
    currentStage: p.currentStage,
    currentTeam: p.currentTeam,
    stageDueAt: iso(p.stageDueAt),
    stageStartedAt: iso(open?.startedAt),
    assignee: open?.assignee ?? null,
    accepted: !!open?.acceptedAt,
    salesOwner: p.salesOwner,
    estimatedValue: showPrice && p.estimatedValue != null ? Number(p.estimatedValue) : null,
    updatedAt: p.updatedAt.toISOString(),
  };
}
