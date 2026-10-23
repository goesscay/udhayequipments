import {
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
import { CurrentUser } from '../common/decorators';
import type { AuthUser } from '../common/types';
import { NotificationsService } from './notifications.service';
import { OpsNotifier } from './ops-notifier';
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
  controllers: [NotificationsController],
  providers: [NotificationsService, RecipientsService, WorkflowNotifier, OpsNotifier, NotificationCleanupTask],
  exports: [NotificationsService, RecipientsService],
})
export class NotificationsModule {}
