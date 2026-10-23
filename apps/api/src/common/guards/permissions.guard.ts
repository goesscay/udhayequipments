import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PermissionKey } from '@udhay/shared';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../decorators';
import type { AuthUser } from '../types';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required?.length) return true;

    const user = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>().user;
    if (!user || !required.every((p) => user.permissions[p])) {
      throw new ForbiddenException('You do not have permission to do this');
    }
    return true;
  }
}
