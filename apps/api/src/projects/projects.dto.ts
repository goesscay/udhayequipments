import {
  PRIORITIES,
  PROJECT_STATUSES,
  STAGE_CODES,
  TEAMS,
  WORKFLOW_ACTIONS,
  type Priority,
  type ProjectStatus,
  type StageCode,
  type TeamCode,
  type WorkflowAction,
} from '@udhay/shared';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateProjectDto {
  @IsString() @MinLength(3) @MaxLength(160) title: string;

  @IsOptional() @IsString() customerId?: string;

  @ValidateIf((o: CreateProjectDto) => !o.customerId)
  @IsString() @MinLength(2) @MaxLength(160)
  customerName?: string;

  @IsOptional() @IsString() @MaxLength(120) contactPerson?: string;

  @ValidateIf((o: CreateProjectDto) => !o.customerId)
  @Matches(/^[0-9+\-\s]{7,20}$/, { message: 'Enter a valid phone number' })
  customerPhone?: string;

  @IsOptional() @Transform(({ value }) => value || undefined) @IsEmail() customerEmail?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(500) siteAddress?: string;
  @IsOptional() @IsString() @MaxLength(5000) requirement?: string;
  @IsOptional() @IsNumber() @Min(0) estimatedValue?: number;
  @IsOptional() @IsIn(PRIORITIES) priority?: Priority;
  @IsOptional() @IsString() salesOwnerId?: string;
}

export class UpdateProjectDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(500) siteAddress?: string;
  @IsOptional() @IsString() @MaxLength(5000) requirement?: string;
  @IsOptional() @IsNumber() @Min(0) estimatedValue?: number;
  @IsOptional() @IsIn(PRIORITIES) priority?: Priority;
}

export class ListProjectsQuery {
  @IsOptional() @IsIn(PROJECT_STATUSES) status?: ProjectStatus;
  @IsOptional() @IsIn(STAGE_CODES) stage?: StageCode;
  @IsOptional() @IsIn(TEAMS) team?: TeamCode;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() overdue?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}

export class TransitionDto {
  @IsIn(WORKFLOW_ACTIONS) action: WorkflowAction;
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

export class ReasonDto {
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

export class AssignDto {
  @IsString() userId: string;
}

export class CommentDto {
  @IsString() @MinLength(1) @MaxLength(4000) body: string;
}
