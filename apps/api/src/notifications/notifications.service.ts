import { Injectable, NotFoundException } from '@nestjs/common';
import type { NotificationItem, NotificationPage, NotificationType } from '@udhay/shared';
import { PrismaService } from '../prisma/prisma.module';

export interface NotifyInput {
  userIds: string[];
  /** Never notify the person who caused the event. */
  excludeUserId?: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  projectId?: string | null;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(input: NotifyInput) {
    const ids = [...new Set(input.userIds)].filter((id) => id !== input.excludeUserId);
    if (!ids.length) return 0;
    await this.prisma.notification.createMany({
      data: ids.map((userId) => ({
        userId,
        type: input.type,
        title: input.title.slice(0, 200),
        body: input.body ?? null,
        projectId: input.projectId ?? null,
      })),
    });
    return ids.length;
  }

  async list(userId: string, opts: { cursor?: string; unreadOnly?: boolean; take?: number }): Promise<NotificationPage> {
    const take = Math.min(opts.take ?? 20, 50);
    const rows = await this.prisma.notification.findMany({
      where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > take;
    const items = rows.slice(0, take);
    return {
      items: items.map(toItem),
      unread: await this.unreadCount(userId),
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string) {
    const res = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (!res.count && !(await this.prisma.notification.count({ where: { id, userId } }))) {
      throw new NotFoundException('Notification not found');
    }
  }

  markAllRead(userId: string) {
    return this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  }

  /** Deletes read notifications older than the retention window. */
  async cleanup(retentionDays: number) {
    const before = new Date(Date.now() - retentionDays * 86_400_000);
    const res = await this.prisma.notification.deleteMany({
      where: { readAt: { not: null }, createdAt: { lt: before } },
    });
    return { deleted: res.count };
  }
}

function toItem(n: {
  id: string;
  type: string;
  title: string;
  body: string | null;
  projectId: string | null;
  readAt: Date | null;
  createdAt: Date;
}): NotificationItem {
  return {
    id: n.id,
    type: n.type as NotificationType,
    title: n.title,
    body: n.body,
    projectId: n.projectId,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  };
}
