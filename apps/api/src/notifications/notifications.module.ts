import {
  Body,
  Controller,
  Get,
  Global,
  HttpCode,
  Injectable,
  Module,
  OnModuleInit,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JobRunner } from '../jobs/jobs.module';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import { CurrentUser } from '../common/decorators';
import type { AuthUser } from '../common/types';
import { NotificationsService } from './notifications.service';
import { OpsNotifier } from './ops-notifier';
import { PushService } from './push.service';
import { RecipientsService } from './recipients.service';
import { WorkflowNotifier } from './workflow-notifier';

/** Every route acts on the signed-in user's own notifications only. */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('cursor') cursor?: string,
    @Query('unread') unread?: string,
  ) {
    return this.notifications.list(user.id, { cursor, unreadOnly: unread === 'true' });
  }

  /** Polled by the bell icon, so it is exempt from the global rate limit. */
  @SkipThrottle()
  @Get('unread-count')
  async unreadCount(@CurrentUser() user: AuthUser) {
    return { unread: await this.notifications.unreadCount(user.id) };
  }

  @Post('read-all')
  @HttpCode(204)
  async readAll(@CurrentUser() user: AuthUser) {
    await this.notifications.markAllRead(user.id);
  }

  @Post(':id/read')
  @HttpCode(204)
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(user.id, id);
  }
}

class PushSubscribeDto {
  @IsUrl({ protocols: ['https'], require_tld: true }) @MaxLength(700) endpoint: string;
  @IsString() @MaxLength(200) p256dh: string;
  @IsString() @MaxLength(100) auth: string;
  @IsOptional() @IsString() @MaxLength(300) userAgent?: string;
}

class PushUnsubscribeDto {
  @IsString() @MaxLength(700) endpoint: string;
}

/** Phone / browser notifications for the signed-in user's own devices. */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('push')
class PushController {
  constructor(private readonly push: PushService) {}

  @Get('public-key')
  async publicKey() {
    return { publicKey: await this.push.publicKey() };
  }

  @Post('subscribe')
  @HttpCode(204)
  subscribe(@CurrentUser() user: AuthUser, @Body() dto: PushSubscribeDto) {
    return this.push.subscribe(user.id, dto);
  }

  @Post('unsubscribe')
  @HttpCode(204)
  unsubscribe(@CurrentUser() user: AuthUser, @Body() dto: PushUnsubscribeDto) {
    return this.push.unsubscribe(user.id, dto.endpoint);
  }

  /** "Send a test" button: reaches every device the user has turned notifications on for. */
  @Post('test')
  @HttpCode(204)
  test(@CurrentUser() user: AuthUser) {
    return this.push.send([user.id], {
      title: 'UDHAY notifications are on',
      body: 'Handoffs, assignments and deadline alerts will appear like this.',
      url: '/notifications',
      tag: 'test',
    });
  }
}

@Injectable()
class NotificationCleanupTask implements OnModuleInit {
  constructor(
    private readonly runner: JobRunner,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const days = Number(this.config.get('NOTIFICATION_RETENTION_DAYS', 90));
    this.runner.register({
      name: 'notification-cleanup',
      everyMs: 24 * 3_600_000,
      leaseMs: 10 * 60_000,
      run: () => this.notifications.cleanup(days),
    });
  }
}

@Global()
@Module({
  controllers: [NotificationsController, PushController],
  providers: [NotificationsService, PushService, RecipientsService, WorkflowNotifier, OpsNotifier, NotificationCleanupTask],
  exports: [NotificationsService, RecipientsService],
})
export class NotificationsModule {}
