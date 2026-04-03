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
    ctx.logger.info('external execution project group', {
      phase: 'execution-scope',
      scope: 'external',
      series,
      projectCount: projects.length,
      projects: projects.map(project => project.name)
    })
  }
}

function logProjectSummary(
  ctx: CommandContext,
  commandName: string,
  project: ExecutionPlanProjectSummary
): void {
  ctx.logger.info('execution scope resolved to project', {
    phase: 'execution-scope',
    command: commandName,
    scope: 'project',
    cwd: ctx.executionPlan.cwd,
    workspaceDir: ctx.executionPlan.workspaceDir,
    projectName: project.name,
    ...project.series != null ? {projectSeries: project.series} : {}
  })
  ctx.logger.info('project-scoped execution only targets the matched project and global outputs', {
    phase: 'execution-scope',
    command: commandName,
    projectName: project.name
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
        title: 'Execution is limited to workspace-level outputs',
        rootCause: diagnosticLines(
          `tnmsc resolved the current execution directory "${ctx.executionPlan.cwd}" to the workspace root.`,
          'This run will sync or clean only workspace-level outputs plus global outputs to improve performance.'
        ),
        exactFix: diagnosticLines(
          'Run tnmsc from a managed project directory to target one project, or from outside the workspace to process every managed project.'
        ),
        details: {
          phase: 'execution-scope',
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
        title: 'Execution will process the full workspace and all managed projects',
        rootCause: diagnosticLines(
          `tnmsc resolved the current execution directory "${ctx.executionPlan.cwd}" as external to workspace "${ctx.executionPlan.workspaceDir}".`,
          'This run may take longer because it will process workspace-level outputs, all managed projects, and global outputs.'
        ),
        exactFix: diagnosticLines(
          `Run tnmsc from "${ctx.executionPlan.workspaceDir}" for workspace-only execution, or from a managed project directory for project-only execution.`
        ),
        details: {
          phase: 'execution-scope',
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
        title: 'Execution directory is inside the workspace but not managed by tnmsc',
        rootCause: diagnosticLines(
          `tnmsc resolved "${ctx.executionPlan.cwd}" inside workspace "${ctx.executionPlan.workspaceDir}", but the directory is not the workspace root and does not belong to any managed project.`,
          'Running from this location is unsupported because tnmsc cannot map the request to a workspace-level or project-level execution target.'
        ),
        exactFix: diagnosticLines(
          'Run tnmsc from the workspace root, from a managed project directory, or from outside the workspace.'
        ),
        details: {
          phase: 'execution-scope',
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
