import type {InputCapabilityContext, InputCollectedContext, Project, ProjectConfig, Workspace} from '../plugins/plugin-core'

import JSON5 from 'json5'
import {
  buildConfigDiagnostic,
  buildFileOperationDiagnostic,
  diagnosticLines
} from '@/diagnostics'
import {AbstractInputCapability, FilePathKind} from '../plugins/plugin-core'

export class AindexInputCapability extends AbstractInputCapability {
  private static readonly projectConfigFileName = 'project.json5'

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
        return JSON5.parse(raw) as ProjectConfig
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

  collect(ctx: InputCapabilityContext): Partial<InputCollectedContext> {
    const {userConfigOptions: options, logger, fs, path} = ctx
    const {workspaceDir, aindexDir} = this.resolveBasePaths(options)

    const aindexProjectsDir = this.resolveAindexPath(options.aindex.app.dist, aindexDir)

    const aindexName = path.basename(aindexDir)

    const aindexProjects: Project[] = []

    if (fs.existsSync(aindexProjectsDir) && fs.statSync(aindexProjectsDir).isDirectory()) {
      try {
        const entries = fs.readdirSync(aindexProjectsDir, {withFileTypes: true})
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const isTheAindex = entry.name === aindexName
            const projectConfig = this.loadProjectConfig(entry.name, aindexDir, options.aindex.app.src, fs, path, logger)

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
      }
      catch (e) {
        logger.error(buildFileOperationDiagnostic({
          code: 'AINDEX_PROJECT_DIRECTORY_SCAN_FAILED',
          title: 'Failed to scan aindex projects directory',
          operation: 'scan',
          targetKind: 'aindex projects directory',
          path: aindexProjectsDir,
          error: e
        }))
      }
    }

    if (aindexProjects.length === 0 && fs.existsSync(workspaceDir) && fs.statSync(workspaceDir).isDirectory()) {
      logger.debug('no projects in dist/app/, falling back to workspace scan', {workspaceDir})
      try {
        const entries = fs.readdirSync(workspaceDir, {withFileTypes: true})
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            const isTheAindex = entry.name === aindexName
            const projectConfig = this.loadProjectConfig(entry.name, aindexDir, options.aindex.app.src, fs, path, logger)

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
