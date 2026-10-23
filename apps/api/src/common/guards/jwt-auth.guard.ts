import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { AccessService } from '../../access/access.service';
import { ALLOW_TEMP_PASSWORD_KEY, IS_PUBLIC_KEY } from '../decorators';
import type { AuthUser } from '../types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly access: AccessService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException();

    let sub: string;
    try {
      ({ sub } = await this.jwt.verifyAsync<{ sub: string }>(token));
    } catch {
      throw new UnauthorizedException('Session expired');
    }

    // Loaded per request so deactivation and role changes apply immediately.
    const user = await this.access.loadAuthUser(sub);
    if (!user) throw new UnauthorizedException();
    req.user = user;

    // A temporary password (new account or admin reset) must be replaced before anything else.
    if (user.mustChangePassword) {
      const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_TEMP_PASSWORD_KEY, [ctx.getHandler(), ctx.getClass()]);
      if (!allowed) {
        throw new ForbiddenException({ message: 'Please set a new password first', code: 'PASSWORD_CHANGE_REQUIRED' });
      }
    }
    return true;
  }
}
