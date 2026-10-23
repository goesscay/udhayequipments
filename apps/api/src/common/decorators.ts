import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '@udhay/shared';
import type { Request } from 'express';
import type { AuthUser, RequestMeta } from './types';

export const IS_PUBLIC_KEY = 'isPublic';
/** Skip authentication for this route. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ALLOW_TEMP_PASSWORD_KEY = 'allowTempPassword';
/** Reachable while the user still has a temporary password (sign-out, change password, own profile). */
export const AllowWithTemporaryPassword = () => SetMetadata(ALLOW_TEMP_PASSWORD_KEY, true);

export const PERMISSIONS_KEY = 'permissions';
/** The user needs every listed permission (any scope). Scope is enforced in services. */
export const RequirePermissions = (...permissions: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<Request & { user: AuthUser }>().user,
);

export const ReqMeta = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestMeta => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return { ip: req.ip, userAgent: req.headers['user-agent']?.slice(0, 255) };
});
