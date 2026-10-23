import {
  BadRequestException,
  Body,
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
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  ALLOWED_UPLOAD_EXTENSIONS,
  DOCUMENT_TYPES,
  MAX_UPLOAD_BYTES,
  type DocumentType,
} from '@udhay/shared';
import { IsIn } from 'class-validator';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.module';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.module';

/**
 * Local-disk storage for Phase 1. Swap for an S3/R2 implementation with the same
 * two methods when moving to production hosting.
 */
@Injectable()
class StorageService {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.get<string>('UPLOAD_DIR', './uploads'));
  }

  async save(buffer: Buffer, ext: string): Promise<string> {
    const now = new Date();
    const dir = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    const key = `${dir}/${randomUUID()}${ext}`;
    await mkdir(join(this.root, dir), { recursive: true });
    await writeFile(join(this.root, key), buffer);
    return key;
  }

  open(key: string) {
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) throw new NotFoundException();
    return createReadStream(path);
  }
}

class UploadDto {
  @IsIn(DOCUMENT_TYPES) type: DocumentType;
}

const COMMERCIAL: DocumentType[] = ['QUOTATION', 'BOQ'];

@Injectable()
class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  async upload(user: AuthUser, projectId: string, type: DocumentType, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Choose a file to upload');
    const ext = extname(file.originalname).toLowerCase();
    if (!(ALLOWED_UPLOAD_EXTENSIONS as readonly string[]).includes(ext)) {
      throw new BadRequestException(`File type ${ext || '(none)'} is not allowed`);
    }
    if (COMMERCIAL.includes(type) && !this.access.canSeePrices(user)) {
      throw new ForbiddenException('You cannot upload commercial documents');
    }

    const project = await this.prisma.project.findFirst({
      where: { AND: [this.access.projectWhere(user, 'document.upload'), { id: projectId }] },
    });
    if (!project) throw new NotFoundException('Project not found');

    const storageKey = await this.storage.save(file.buffer, ext);
    const doc = await this.prisma.$transaction(async (tx) => {
      const version = (await tx.document.count({ where: { projectId, type } })) + 1;
      return tx.document.create({
        data: {
          projectId,
          stage: project.currentStage,
          type,
          version,
          fileName: file.originalname.slice(0, 190),
          storageKey,
          mimeType: file.mimetype.slice(0, 150),
          sizeBytes: file.size,
          uploadedById: user.id,
        },
      });
    });
    await this.audit.log({ actorId: user.id, entity: 'document', entityId: doc.id, action: 'upload', data: { projectId, type, version: doc.version } });
    return doc;
  }

  async find(user: AuthUser, id: string, permission: 'document.view' | 'document.upload') {
    const doc = await this.prisma.document.findFirst({
      where: { id, deletedAt: null, project: this.access.projectWhere(user, permission) },
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (COMMERCIAL.includes(doc.type) && !this.access.canSeePrices(user)) throw new NotFoundException('Document not found');
    return doc;
  }

  async download(user: AuthUser, id: string) {
    const doc = await this.find(user, id, 'document.view');
    return { doc, stream: this.storage.open(doc.storageKey) };
  }

  async remove(user: AuthUser, id: string) {
    const doc = await this.find(user, id, 'document.upload');
    if (doc.uploadedById !== user.id && this.access.scopeOf(user, 'document.upload') !== 'ALL') {
      throw new ForbiddenException('Only the uploader or an admin can remove this document');
    }
    await this.prisma.document.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.log({ actorId: user.id, entity: 'document', entityId: id, action: 'delete' });
  }
}

@ApiTags('documents')
@ApiBearerAuth()
@Controller()
class DocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  @Post('projects/:id/documents')
  @RequirePermissions('document.upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  upload(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UploadDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.docs.upload(user, id, dto.type, file);
  }

  @Get('documents/:id/download')
  @RequirePermissions('document.view')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { doc, stream } = await this.docs.download(user, id);
    res.set({
      'Content-Type': doc.mimeType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
    });
    return new StreamableFile(stream);
  }

  @Delete('documents/:id')
  @HttpCode(204)
  @RequirePermissions('document.upload')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.docs.remove(user, id);
  }
}

@Module({ controllers: [DocumentsController], providers: [DocumentsService, StorageService] })
export class DocumentsModule {}
