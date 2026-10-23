import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import type { AuthResponse } from '@udhay/shared';
import { AccessService } from '../access/access.service';
import { CurrentUser, Public, ReqMeta } from '../common/decorators';
import type { AuthUser, RequestMeta } from '../common/types';
import { AuthService, type IssuedSession } from './auth.service';

class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password: string;
}

const REFRESH_COOKIE = 'udhay_rt';
const COOKIE_PATH = '/api/auth';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly access: AccessService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.respond(res, await this.auth.login(dto.email, dto.password, meta));
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @ReqMeta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    try {
      return this.respond(res, await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], meta));
    } catch (e) {
      res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
      throw e;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.access.toSession(user);
  }

  private respond(res: Response, session: IssuedSession): AuthResponse {
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'strict',
      path: COOKIE_PATH,
      expires: session.refreshExpiresAt,
    });
    return { accessToken: session.accessToken, user: session.user };
  }
}
