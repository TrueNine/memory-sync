import type {InputCapabilityContext, InputCollectedContext, Project, ProjectConfig, Workspace} from '../plugins/plugin-core'
import type {AindexProjectSeriesConfig} from '@/aindex-project-series'

import JSON5 from 'json5'
import {
  collectAindexProjectSeriesProjectNameConflicts,
  resolveAindexProjectSeriesConfigs
} from '@/aindex-project-series'
import {
  buildConfigDiagnostic,
  buildFileOperationDiagnostic,
  diagnosticLines
} from '@/diagnostics'
import {AbstractInputCapability, FilePathKind} from '../plugins/plugin-core'

export class AindexInputCapability extends AbstractInputCapability {
  private static readonly projectConfigFileName = 'project.json5'
  private static readonly conflictingProjectSeriesCode = 'AINDEX_PROJECT_SERIES_NAME_CONFLICT'

  constructor() {
    super('AindexInputCapability')
  }

  private loadProjectConfig(
    projectName: string,
    aindexDir: string,
    srcPath: string,
    fs: InputCapabilityContext['fs'],
    path: InputCapabilityContext['path'],
    logger: InputCapabilityContext['logger']
  ): ProjectConfig | undefined {
    const configPath = path.join(
      aindexDir,
      srcPath,
      projectName,
      AindexInputCapability.projectConfigFileName
    )
    if (!fs.existsSync(configPath)) return void 0

    try {
      const raw = fs.readFileSync(configPath, 'utf8')

      try {
        return JSON5.parse(raw)
      }
      catch (e) {
        logger.warn(buildConfigDiagnostic({
          code: 'AINDEX_PROJECT_JSON5_INVALID',
          title: `Failed to parse ${AindexInputCapability.projectConfigFileName} for ${projectName}`,
          reason: diagnosticLines(
            `tnmsc could not parse the ${AindexInputCapability.projectConfigFileName} file for "${projectName}".`,
            `Underlying error: ${e instanceof Error ? e.message : String(e)}`
          ),
          configPath,
          exactFix: diagnosticLines(
            `Fix the JSON5 syntax in ${AindexInputCapability.projectConfigFileName} and rerun tnmsc.`
          ),
          details: {
            projectName,
            errorMessage: e instanceof Error ? e.message : String(e)
          }
        }))
        return void 0
      }
    }
    catch (e) {
      logger.warn(buildConfigDiagnostic({
        code: 'AINDEX_PROJECT_JSON5_READ_FAILED',
        title: `Failed to load ${AindexInputCapability.projectConfigFileName} for ${projectName}`,
        reason: diagnosticLines(
          `tnmsc could not read the ${AindexInputCapability.projectConfigFileName} file for "${projectName}".`,
          `Underlying error: ${e instanceof Error ? e.message : String(e)}`
        ),
        configPath,
        exactFix: diagnosticLines(
          `Ensure ${AindexInputCapability.projectConfigFileName} exists, is readable, and contains valid JSON5.`
        ),
        details: {
          projectName,
          errorMessage: e instanceof Error ? e.message : String(e)
        }
      }))
      return void 0
    }
  }

  private async scanSeriesProjects(
    ctx: InputCapabilityContext,
    workspaceDir: string,
    aindexDir: string,
    aindexName: string,
    projectNameSource: readonly AindexProjectSeriesConfig[]
  ): Promise<Project[]> {
    const {logger, fs, path} = ctx
    const projectGroups = await Promise.all(projectNameSource.map(async series => {
      const aindexProjectsDir = this.resolveAindexPath(series.dist, aindexDir)
      const distDirStat = await fs.promises.stat(aindexProjectsDir).catch(() => void 0)
      if (!(distDirStat?.isDirectory() === true)) return []

      try {
        const entries = (await fs.promises.readdir(aindexProjectsDir, {withFileTypes: true}))
          .filter(entry => entry.isDirectory())
          .sort((a, b) => a.name.localeCompare(b.name))
        const projects: Project[] = []

        for (const entry of entries) {
          const isTheAindex = entry.name === aindexName
          const projectConfig = this.loadProjectConfig(entry.name, aindexDir, series.src, fs, path, logger)

          projects.push({
            name: entry.name,
            promptSeries: series.name,
            ...isTheAindex && {isPromptSourceProject: true},
            ...projectConfig != null && {projectConfig},
            dirFromWorkspacePath: {
              pathKind: FilePathKind.Relative,
              path: entry.name,
              basePath: workspaceDir,
              getDirectoryName: () => entry.name,
              getAbsolutePath: () => path.resolve(workspaceDir, entry.name)
            }
          })
        }

        return projects
      }
      catch (e) {
        logger.error(buildFileOperationDiagnostic({
          code: 'AINDEX_PROJECT_DIRECTORY_SCAN_FAILED',
          title: `Failed to scan aindex ${series.name} projects directory`,
          operation: 'scan',
          targetKind: `aindex ${series.name} projects directory`,
          path: aindexProjectsDir,
          error: e
        }))

        return []
      }
    }))

    return projectGroups.flat()
  }

  private loadFallbackProjectConfig(
    projectName: string,
    aindexDir: string,
    ctx: Pick<InputCapabilityContext, 'fs' | 'path' | 'logger' | 'userConfigOptions'>
  ): ProjectConfig | undefined {
    for (const series of resolveAindexProjectSeriesConfigs(ctx.userConfigOptions)) {
      const config = this.loadProjectConfig(projectName, aindexDir, series.src, ctx.fs, ctx.path, ctx.logger)
      if (config != null) return config
    }

    return void 0
  }

  private assertNoCrossSeriesProjectNameConflicts(
    ctx: Pick<InputCapabilityContext, 'logger' | 'fs' | 'path'>,
    aindexDir: string,
    projectSeries: readonly AindexProjectSeriesConfig[]
  ): void {
    const {logger, fs, path} = ctx
    const projectRefs = projectSeries.flatMap(series => {
      const seriesSourceDir = path.join(aindexDir, series.src)
      if (!(fs.existsSync(seriesSourceDir) && fs.statSync(seriesSourceDir).isDirectory())) return []

      return fs
        .readdirSync(seriesSourceDir, {withFileTypes: true})
        .filter(entry => entry.isDirectory())
        .map(entry => ({
          projectName: entry.name,
          seriesName: series.name,
          seriesDir: path.join(seriesSourceDir, entry.name)
        }))
    })
    const conflicts = collectAindexProjectSeriesProjectNameConflicts(projectRefs)
    if (conflicts.length === 0) return

    logger.error(buildConfigDiagnostic({
      code: AindexInputCapability.conflictingProjectSeriesCode,
      title: 'Project names must be unique across app, ext, arch, and softwares',
      reason: diagnosticLines(
        'tnmsc maps project-scoped outputs back to workspace project names, so app/ext/arch/softwares cannot reuse the same directory name.',
        `Conflicting project names: ${conflicts.map(conflict => conflict.projectName).join(', ')}`
      ),
      exactFix: diagnosticLines(
        'Rename the conflicting project directory in one of the app/ext/arch/softwares source trees and rerun tnmsc.'
      ),
      possibleFixes: conflicts.map(conflict => diagnosticLines(
        `"${conflict.projectName}" is currently declared in: ${conflict.refs.map(ref => `${ref.seriesName} (${ref.seriesDir})`).join(', ')}`
      )),
      details: {
        aindexDir,
        conflicts: conflicts.map(conflict => ({
          projectName: conflict.projectName,
          refs: conflict.refs.map(ref => ({
            seriesName: ref.seriesName,
            seriesDir: ref.seriesDir
          }))
        }))
      }
    }))

    throw new Error('Aindex project series name conflict')
  }

  async collect(ctx: InputCapabilityContext): Promise<Partial<InputCollectedContext>> {
    const {userConfigOptions: options, logger, fs, path} = ctx
    const {workspaceDir, aindexDir} = this.resolveBasePaths(options)
    const aindexName = path.basename(aindexDir)
    const projectSeries = resolveAindexProjectSeriesConfigs(options)

    // Project outputs intentionally collapse to <workspace>/<projectName>, so
    // app/ext/arch/softwares must never reuse the same project directory name.
    this.assertNoCrossSeriesProjectNameConflicts(ctx, aindexDir, projectSeries)

    const aindexProjects = await this.scanSeriesProjects(ctx, workspaceDir, aindexDir, aindexName, projectSeries)

    if (aindexProjects.length === 0 && fs.existsSync(workspaceDir) && fs.statSync(workspaceDir).isDirectory()) {
      logger.debug('no projects in dist/app, dist/ext, or dist/arch; falling back to workspace scan', {workspaceDir})
      try {
        const entries = fs
          .readdirSync(workspaceDir, {withFileTypes: true})
          .filter(entry => entry.isDirectory())
          .sort((a, b) => a.name.localeCompare(b.name))

        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue

          const isTheAindex = entry.name === aindexName
          const projectConfig = this.loadFallbackProjectConfig(entry.name, aindexDir, ctx)

          aindexProjects.push({
            name: entry.name,
            ...isTheAindex && {isPromptSourceProject: true},
            ...projectConfig != null && {projectConfig},
            dirFromWorkspacePath: {
              pathKind: FilePathKind.Relative,
              path: entry.name,
              basePath: workspaceDir,
              getDirectoryName: () => entry.name,
              getAbsolutePath: () => path.resolve(workspaceDir, entry.name)
            }
          })
        }
      }
      catch (e) {
        logger.error(buildFileOperationDiagnostic({
          code: 'WORKSPACE_DIRECTORY_SCAN_FAILED',
          title: 'Failed to scan workspace directory',
          operation: 'scan',
          targetKind: 'workspace directory',
          path: workspaceDir,
          error: e
        }))
      }
    }

    const workspace: Workspace = {
      directory: {
        pathKind: FilePathKind.Absolute,
        path: workspaceDir,
        getDirectoryName: () => path.basename(workspaceDir)
      },
      projects: aindexProjects
    }

    return {workspace}
  }
}
