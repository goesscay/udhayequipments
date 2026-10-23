import { Body, Controller, Get, HttpCode, Module, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import type { AuthUser } from '../common/types';
import { CustomersModule } from '../customers/customers.module';
import {
  AssignDto,
  CommentDto,
  CreateProjectDto,
  ListProjectsQuery,
  ReasonDto,
  TransitionDto,
  UpdateProjectDto,
} from './projects.dto';
import { ProjectsService } from './projects.service';
import { GatesService } from './gates.service';
import { WorkflowService } from './workflow.service';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly workflow: WorkflowService,
  ) {}

  @Get()
  @RequirePermissions('project.view')
  list(@CurrentUser() user: AuthUser, @Query() q: ListProjectsQuery) {
    return this.projects.list(user, q);
  }

  @Get('queue')
  queue(@CurrentUser() user: AuthUser) {
    return this.projects.queue(user);
  }

  @Post()
  @RequirePermissions('project.create')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProjectDto) {
    return this.projects.create(user, dto);
  }

  @Get(':id')
  @RequirePermissions('project.view')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projects.detail(user, id);
  }

  @Patch(':id')
  @RequirePermissions('project.update')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(user, id, dto);
  }

  /** Move the project through the workflow. Permission is checked per transition. */
  @Post(':id/transitions')
  @HttpCode(200)
  transition(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TransitionDto) {
    return this.workflow.transition(user, id, dto.action, dto.reason);
  }

  @Post(':id/accept')
  @HttpCode(200)
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.workflow.accept(user, id);
  }

  @Post(':id/assign')
  @HttpCode(200)
  @RequirePermissions('stage.assign')
  assign(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssignDto) {
    return this.workflow.assign(user, id, dto.userId);
  }

  @Post(':id/hold')
  @HttpCode(200)
  @RequirePermissions('project.manage')
  hold(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.workflow.setHold(user, id, true, dto.reason);
  }

  @Post(':id/resume')
  @HttpCode(200)
  @RequirePermissions('project.manage')
  resume(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.workflow.setHold(user, id, false);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions('project.manage')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.workflow.cancel(user, id, dto.reason ?? '');
  }

  @Post(':id/comments')
  @RequirePermissions('project.view')
  comment(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CommentDto) {
    return this.projects.addComment(user, id, dto.body);
  }
}

@Module({
  imports: [CustomersModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, WorkflowService, GatesService],
  exports: [WorkflowService, GatesService],
})
export class ProjectsModule {}
