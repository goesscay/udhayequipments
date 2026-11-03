import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.module';

const KEY = 'webpush.vapid';

interface Vapid {
  publicKey: string;
  privateKey: string;
}

export interface PushPayload {
  title: string;
  body?: string | null;
  /** Page opened when the notification is tapped. */
  url: string;
  /** Notifications with the same tag replace each other on the phone. */
  tag?: string;
}

export interface SubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}

/**
 * Web push to phones and browsers. The VAPID key pair is made on first use and kept in the
 * database (app setting), so no environment variable has to be set on the server.
 */
@Injectable()
export class PushService {
  private readonly log = new Logger(PushService.name);
  private vapid: Promise<Vapid> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private keys(): Promise<Vapid> {
    this.vapid ??= (async () => {
      const row = await this.prisma.appSetting.findUnique({ where: { key: KEY } });
      if (row) return row.value as unknown as Vapid;
      const fresh = webpush.generateVAPIDKeys();
      // Another process may have saved a pair first; whichever row exists wins.
      await this.prisma.appSetting.upsert({
        where: { key: KEY },
        create: { key: KEY, value: { ...fresh } },
        update: {},
      });
      const saved = await this.prisma.appSetting.findUniqueOrThrow({ where: { key: KEY } });
      return saved.value as unknown as Vapid;
    })().catch((err) => {
      this.vapid = null;
      throw err;
    });
    return this.vapid;
  }

  async publicKey() {
    return (await this.keys()).publicKey;
  }

  async subscribe(userId: string, sub: SubscriptionInput) {
    const data = {
      userId,
      p256dh: sub.p256dh,
      auth: sub.auth,
      userAgent: sub.userAgent?.slice(0, 300) ?? null,
    };
    // A phone that was used by someone else now belongs to whoever signed in last.
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { endpoint: sub.endpoint, ...data },
      update: data,
    });
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  /** Sends to every device of the given users. Never throws: push is a best-effort extra. */
  async send(userIds: string[], payload: PushPayload) {
    try {
      const subs = await this.prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
      if (!subs.length) return;
      const { publicKey, privateKey } = await this.keys();
      const subject = this.subject();
      const unread = await this.prisma.notification.groupBy({
        by: ['userId'],
        where: { userId: { in: [...new Set(subs.map((s) => s.userId))] }, readAt: null },
        _count: { _all: true },
      });
      const counts = new Map(unread.map((u) => [u.userId, u._count._all]));
      const gone: string[] = [];
      await Promise.all(
        subs.map(async (s) => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              JSON.stringify({ ...payload, unread: counts.get(s.userId) ?? 0 }),
              {
                vapidDetails: { subject, publicKey, privateKey },
                TTL: 24 * 3600,
                urgency: 'high',
                timeout: 10_000,
              },
            );
          } catch (err) {
            const status = (err as { statusCode?: number }).statusCode;
            // 404/410: the phone unsubscribed or the app was removed.
            if (status === 404 || status === 410) gone.push(s.id);
            else this.log.warn(`Push failed (${status ?? 'network'}): ${(err as Error).message}`);
          }
        }),
      );
      if (gone.length) await this.prisma.pushSubscription.deleteMany({ where: { id: { in: gone } } });
    } catch (err) {
      this.log.warn(`Push skipped: ${(err as Error).message}`);
    }
  }

  private subject() {
    const origin = this.config.get<string>('WEB_ORIGIN', '').split(',')[0].trim();
    return origin.startsWith('https://') ? origin : 'mailto:admin@udhayequipments.com';
  }
}
