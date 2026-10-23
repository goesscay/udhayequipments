import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import type { HandoverInfo, SiteSummary, SnagRow } from '@udhay/shared';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.module';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.module';
import { AppRulesService } from '../settings/app-rules.service';
import { addMonths } from './dates';

class SnagDto {
  @IsString() @MinLength(3) @MaxLength(200) title: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
}

class ResolveSnagDto {
  @IsString() @MinLength(2) @MaxLength(2000) resolution: string;
}

class HandoverDto {
  @IsString() @MinLength(2) @MaxLength(120) signedByName: string;
  @IsOptional() @Matches(/^[0-9+\-\s]{7,20}$/, { message: 'Enter a valid phone number' }) signedByPhone?: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(120) warrantyMonths: number;
  @IsOptional() @IsBoolean() trainingDone?: boolean;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
  /** Customer signature image (or a scanned signed certificate) uploaded as HANDOVER_CERT. */
  @IsString() certificateDocumentId: string;
}

const userRef = { select: { id: true, name: true } } as const;
const snagInclude = { raisedBy: userRef, resolvedBy: userRef } satisfies Prisma.SnagInclude;

function toSnag(s: Prisma.SnagGetPayload<{ include: typeof snagInclude }>): SnagRow {
  return {
    id: s.id,
    title: s.title,
    description: s.description,
    status: s.status,
    resolution: s.resolution,
    raisedBy: s.raisedBy,
    resolvedBy: s.resolvedBy,
    resolvedAt: s.resolvedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
  };
}

@Injectable()
class InstallationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly rules: AppRulesService,
  ) {}

  async summary(user: AuthUser, projectId: string): Promise<SiteSummary> {
    await this.access.visibleProject(user, projectId);
    const [snags, handover, rules] = await Promise.all([
      this.prisma.snag.findMany({ where: { projectId }, include: snagInclude, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] }),
      this.prisma.handover.findUnique({ where: { projectId }, include: { recordedBy: userRef } }),
      this.rules.get(),
    ]);
    const info: HandoverInfo | null = handover && {
      signedByName: handover.signedByName,
      signedByPhone: handover.signedByPhone,
      signedAt: handover.signedAt.toISOString(),
      warrantyMonths: handover.warrantyMonths,
      warrantyStart: handover.warrantyStart.toISOString(),
      warrantyEnd: handover.warrantyEnd.toISOString(),
      trainingDone: handover.trainingDone,
      notes: handover.notes,
      certificateDocumentId: handover.certificateDocumentId,
      recordedBy: handover.recordedBy,
    };
    return {
      snags: snags.map(toSnag),
      openSnags: snags.filter((s) => s.status === 'OPEN').length,
      handover: info,
      canManage: this.access.canWorkAs(user, 'installation.manage', 'PROJECT'),
      defaultWarrantyMonths: rules.defaultWarrantyMonths,
    };
  }

  async addSnag(user: AuthUser, projectId: string, dto: SnagDto) {
    await this.guardProject(user, projectId);
    const snag = await this.prisma.snag.create({
      data: { projectId, title: dto.title.trim(), description: dto.description?.trim() || null, raisedById: user.id },
    });
    await this.audit.log({ actorId: user.id, entity: 'snag', entityId: snag.id, action: 'create', data: { projectId } });
    return snag;
  }

  async resolveSnag(user: AuthUser, id: string, resolution: string) {
    const snag = await this.findSnag(user, id);
    if (snag.status === 'RESOLVED') return;
    await this.prisma.snag.update({
      where: { id },
      data: { status: 'RESOLVED', resolution: resolution.trim(), resolvedById: user.id, resolvedAt: new Date() },
    });
    await this.audit.log({ actorId: user.id, entity: 'snag', entityId: id, action: 'resolve' });
  }

  async reopenSnag(user: AuthUser, id: string) {
    const snag = await this.findSnag(user, id);
    if (snag.status === 'OPEN') return;
    await this.prisma.snag.update({ where: { id }, data: { status: 'OPEN', resolvedById: null, resolvedAt: null } });
    await this.audit.log({ actorId: user.id, entity: 'snag', entityId: id, action: 'reopen' });
  }

  async removeSnag(user: AuthUser, id: string) {
    const snag = await this.findSnag(user, id);
    if (snag.raisedById !== user.id && this.access.scopeOf(user, 'installation.manage') !== 'ALL') {
      throw new ForbiddenException('Only the person who raised it or an admin can delete a snag');
    }
    await this.prisma.snag.delete({ where: { id } });
    await this.audit.log({ actorId: user.id, entity: 'snag', entityId: id, action: 'delete', data: { title: snag.title } });
  }

  async recordHandover(user: AuthUser, projectId: string, dto: HandoverDto) {
    const project = await this.guardProject(user, projectId);
    if (project.currentStage !== 'HANDOVER') throw new BadRequestException('The project is not at the Handover stage');
    if (await this.prisma.handover.findUnique({ where: { projectId } })) throw new ConflictException('Handover already recorded');
    const doc = await this.prisma.document.findFirst({
      where: { id: dto.certificateDocumentId, projectId, type: 'HANDOVER_CERT', deletedAt: null },
    });
    if (!doc) throw new BadRequestException('Capture the customer signature or upload the signed certificate first');

    const now = new Date();
    const handover = await this.prisma.handover.create({
      data: {
        projectId,
        signedByName: dto.signedByName.trim(),
        signedByPhone: dto.signedByPhone?.trim() || null,
        signedAt: now,
        warrantyMonths: dto.warrantyMonths,
        warrantyStart: now,
        warrantyEnd: addMonths(now, dto.warrantyMonths),
        trainingDone: !!dto.trainingDone,
        notes: dto.notes?.trim() || null,
        certificateDocumentId: doc.id,
        recordedById: user.id,
      },
    });
    await this.audit.log({ actorId: user.id, entity: 'project', entityId: projectId, action: 'handover_recorded', data: { warrantyMonths: dto.warrantyMonths } });
    return handover;
  }

  private async guardProject(user: AuthUser, projectId: string) {
    this.access.requireWorkAs(user, 'installation.manage', 'PROJECT');
    const project = await this.access.visibleProject(user, projectId);
    if (project.status !== 'ACTIVE') throw new BadRequestException('Project is not active');
    return project;
  }

  private async findSnag(user: AuthUser, id: string) {
    const snag = await this.prisma.snag.findUnique({ where: { id } });
    if (!snag) throw new NotFoundException('Snag not found');
    await this.guardProject(user, snag.projectId);
    return snag;
  }
}

@ApiTags('installation')
@ApiBearerAuth()
@Controller()
class InstallationController {
  constructor(private readonly site: InstallationService) {}

  @Get('projects/:id/site')
  @RequirePermissions('project.view')
  summary(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.site.summary(user, id);
  }

  @Post('projects/:id/snags')
  @RequirePermissions('installation.manage')
  addSnag(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SnagDto) {
    return this.site.addSnag(user, id, dto);
  }

  @Post('snags/:id/resolve')
  @HttpCode(204)
  @RequirePermissions('installation.manage')
  resolve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ResolveSnagDto) {
    return this.site.resolveSnag(user, id, dto.resolution);
  }

  @Post('snags/:id/reopen')
  @HttpCode(204)
  @RequirePermissions('installation.manage')
  reopen(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.site.reopenSnag(user, id);
  }

  @Delete('snags/:id')
  @HttpCode(204)
  @RequirePermissions('installation.manage')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.site.removeSnag(user, id);
  }

  @Post('projects/:id/handover')
  @RequirePermissions('installation.manage')
  handover(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: HandoverDto) {
    return this.site.recordHandover(user, id, dto);
  }
}

@Module({ controllers: [InstallationController], providers: [InstallationService] })
export class InstallationModule {}
