import type {AindexProjectSeriesName, ExecutionPlanProjectSummary} from '@truenine/memory-sync-sdk'
import type {CommandContext, CommandResult} from './Command'
import {buildDiagnostic, diagnosticLines} from '@truenine/memory-sync-sdk'

const SERIES_ORDER: readonly AindexProjectSeriesName[] = ['app', 'ext', 'arch', 'softwares']

function buildUnsupportedMessage(ctx: CommandContext): string {
  return [
    `Unsupported execution directory "${ctx.executionPlan.cwd}".`,
    `The directory is inside workspace "${ctx.executionPlan.workspaceDir}" but is not managed by tnmsc.`,
    'Run tnmsc from the workspace root, from a managed project directory, or from outside the workspace.'
  ].join(' ')
}

function logExternalProjectGroups(ctx: CommandContext): void {
  for (const series of SERIES_ORDER) {
    const projects = ctx.executionPlan.projectsBySeries[series]
    if (projects.length === 0) continue
    ctx.logger.debug('External execution includes project group', {
      series,
      count: projects.length,
      projects: projects.map(project => project.name)
    })
  }
}

function logProjectSummary(
  ctx: CommandContext,
  commandName: string,
  project: ExecutionPlanProjectSummary
): void {
  ctx.logger.info('Running against one managed project', {
    command: commandName,
    project: project.name,
    ...project.series != null ? {series: project.series} : {},
    workspace: ctx.executionPlan.workspaceDir
  })
}

export function runExecutionPreflight(
  ctx: CommandContext,
  commandName: string
): CommandResult | undefined {
  switch (ctx.executionPlan.scope) {
    case 'workspace':
      ctx.logger.warn(buildDiagnostic({
        code: 'EXECUTION_SCOPE_WORKSPACE',
        title: 'Running from the workspace root',
        rootCause: diagnosticLines(
          `This run will only touch workspace-level outputs and global outputs.`,
          `Current directory: ${ctx.executionPlan.cwd}`
        ),
        exactFix: diagnosticLines(
          'Run tnmsc from a managed project directory to target one project, or from outside the workspace to include every managed project.'
        ),
        details: {
          command: commandName,
          scope: 'workspace',
          cwd: ctx.executionPlan.cwd,
          workspaceDir: ctx.executionPlan.workspaceDir
        }
      }))
      return void 0
    case 'project':
      logProjectSummary(ctx, commandName, ctx.executionPlan.matchedProject)
      return void 0
    case 'external':
      ctx.logger.warn(buildDiagnostic({
        code: 'EXECUTION_SCOPE_EXTERNAL',
        title: 'Running outside the workspace',
        rootCause: diagnosticLines(
          `This run will process the workspace, every managed project, and global outputs.`,
          `Current directory: ${ctx.executionPlan.cwd}`
        ),
        exactFix: diagnosticLines(
          `Run tnmsc from "${ctx.executionPlan.workspaceDir}" for workspace-only execution, or from a managed project directory for project-only execution.`
        ),
        details: {
          command: commandName,
          scope: 'external',
          cwd: ctx.executionPlan.cwd,
          workspaceDir: ctx.executionPlan.workspaceDir
        }
      }))
      logExternalProjectGroups(ctx)
      return void 0
    case 'unsupported': {
      const message = buildUnsupportedMessage(ctx)
      ctx.logger.error(buildDiagnostic({
        code: 'EXECUTION_SCOPE_UNSUPPORTED',
        title: 'This directory is not a managed tnmsc target',
        rootCause: diagnosticLines(
          `tnmsc cannot map "${ctx.executionPlan.cwd}" to the workspace root or any managed project.`,
          `Workspace: ${ctx.executionPlan.workspaceDir}`
        ),
        exactFix: diagnosticLines(
          'Run tnmsc from the workspace root, from a managed project directory, or from outside the workspace.'
        ),
        details: {
          command: commandName,
          scope: 'unsupported',
          cwd: ctx.executionPlan.cwd,
          workspaceDir: ctx.executionPlan.workspaceDir,
          managedProjectCount: ctx.executionPlan.managedProjects.length
        }
      }))
      return {
        success: false,
        filesAffected: 0,
        dirsAffected: 0,
        message
      }
    }
  }
}
