import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from '@node-rs/argon2';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AuthResponse } from '@udhay/shared';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.module';
import type { RequestMeta } from '../common/types';
import { PrismaService } from '../prisma/prisma.module';

export interface IssuedSession extends AuthResponse {
  refreshToken: string;
  refreshExpiresAt: Date;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

// Verified against when the email is unknown, so login timing doesn't reveal which emails exist.
const dummyHash = hash(randomBytes(16).toString('hex'));

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string, meta: RequestMeta): Promise<IssuedSession> {
    const user = await this.prisma.user.findFirst({
      where: { email: email.trim().toLowerCase(), deletedAt: null },
    });
    const valid = await verify(user?.passwordHash ?? (await dummyHash), password).catch(() => false);
    if (!user || !valid || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await this.audit.log({ actorId: user.id, entity: 'user', entityId: user.id, action: 'login', ip: meta.ip });
    return this.issue(user.id, meta);
  }

  /** Rotates the refresh token. Re-use of an already rotated token revokes every session of that user. */
  async refresh(raw: string | undefined, meta: RequestMeta): Promise<IssuedSession> {
    const [id, secret] = (raw ?? '').split('.');
    if (!id || !secret) throw new UnauthorizedException();

    const token = await this.prisma.refreshToken.findUnique({ where: { id } });
    if (!token || !safeEqual(token.tokenHash, sha256(secret))) throw new UnauthorizedException();

    if (token.revokedAt) {
      await this.revokeAll(token.userId);
      await this.audit.log({
        actorId: token.userId, entity: 'user', entityId: token.userId,
        action: 'refresh_token_reuse', ip: meta.ip,
      });
      throw new UnauthorizedException();
    }
    if (token.expiresAt < new Date()) throw new UnauthorizedException('Session expired');

    const session = await this.issue(token.userId, meta);
    const newId = session.refreshToken.split('.')[0];
    await this.prisma.refreshToken.update({
      where: { id: token.id },
      data: { revokedAt: new Date(), replacedById: newId },
    });
    return session;
  }

  async logout(raw: string | undefined) {
    const [id] = (raw ?? '').split('.');
    if (id) {
      await this.prisma.refreshToken.updateMany({
        where: { id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }

  revokeAll(userId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issue(userId: string, meta: RequestMeta): Promise<IssuedSession> {
    const user = await this.access.loadAuthUser(userId);
    if (!user) throw new UnauthorizedException();

    const secret = randomBytes(32).toString('base64url');
    const days = Number(this.config.get('REFRESH_TTL_DAYS', 30));
    const refreshExpiresAt = new Date(Date.now() + days * 86_400_000);
    const row = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256(secret),
        expiresAt: refreshExpiresAt,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    return {
      accessToken: await this.jwt.signAsync({ sub: userId }),
      user: this.access.toSession(user),
      refreshToken: `${row.id}.${secret}`,
      refreshExpiresAt,
    };
  }
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
