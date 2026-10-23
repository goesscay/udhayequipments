import { Controller, Get, Global, Injectable, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import { RequirePermissions } from '../common/decorators';
import type { Db } from '../common/types';
import { PrismaService } from '../prisma/prisma.module';

export interface AuditEntry {
  actorId: string | null;
  entity: string;
  entityId: string;
  action: string;
  data?: Prisma.InputJsonValue;
  ip?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pass the transaction client when logging inside a transaction. */
  log(entry: AuditEntry, db: Db = this.prisma) {
    return db.auditLog.create({ data: entry });
  }

  list(params: { entity?: string; entityId?: string; take?: number }) {
    return this.prisma.auditLog.findMany({
      where: { entity: params.entity, entityId: params.entityId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(params.take ?? 100, 500),
      include: { actor: { select: { id: true, name: true } } },
    });
  }
}

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('audit.view')
  list(@Query('entity') entity?: string, @Query('entityId') entityId?: string) {
    return this.audit.list({ entity, entityId });
  }
}

@Global()
@Module({ providers: [AuditService], controllers: [AuditController], exports: [AuditService] })
export class AuditModule {}
