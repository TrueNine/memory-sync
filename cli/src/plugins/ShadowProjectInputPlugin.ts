import type {CollectedInputContext, InputPluginContext, Project, Workspace} from '@/types'
import type {ProjectConfig} from '@/types/ConfigTypes.schema'

import {parse as parseJsonc} from 'jsonc-parser'
import {
  FilePathKind
} from '@/types'
import {AbstractInputPlugin} from './AbstractInputPlugin'

export class ShadowProjectInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('ShadowProjectInputPlugin')
  }

  private loadProjectConfig(
    projectName: string,
    shadowProjectDir: string,
    srcPath: string,
    fs: InputPluginContext['fs'],
    path: InputPluginContext['path'],
    logger: InputPluginContext['logger']
  ): ProjectConfig | undefined {
    const configPath = path.join(shadowProjectDir, srcPath, projectName, 'project.jsonc')
    if (!fs.existsSync(configPath)) return void 0
    try {
      const raw = fs.readFileSync(configPath, 'utf8')
      const errors: import('jsonc-parser').ParseError[] = []
      const result = parseJsonc(raw, errors) as ProjectConfig
      if (errors.length > 0) {
        logger.warn(`failed to parse project.jsonc for ${projectName}`, {path: configPath, errors})
        return void 0
      }
      return result
    } catch (e) {
      logger.warn(`failed to parse project.jsonc for ${projectName}`, {path: configPath, error: e})
      return void 0
    }
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const {userConfigOptions: options, logger, fs, path} = ctx
    const {workspaceDir, shadowProjectDir} = this.resolveBasePaths(options)

    const shadowProjectsDir = this.resolveShadowPath(options.shadowSourceProject.project.dist, shadowProjectDir)

    const shadowSourceProjectName = path.basename(shadowProjectDir) // Get the shadow source project name (e.g., "aindex") from shadowProjectDir

    const shadowProjects: Project[] = []

    if (fs.existsSync(shadowProjectsDir) && fs.statSync(shadowProjectsDir).isDirectory()) { // First, try to collect projects from dist/app/ directory
      try {
        const entries = fs.readdirSync(shadowProjectsDir, {withFileTypes: true})
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const isTheShadowSourceProject = entry.name === shadowSourceProjectName // Other projects should have their output files cleaned normally // Only mark the shadow source project itself (e.g., aindex) as prompt source project
            const projectConfig = this.loadProjectConfig(entry.name, shadowProjectDir, options.shadowSourceProject.project.src, fs, path, logger)

            shadowProjects.push({
              name: entry.name,
              ...isTheShadowSourceProject && {isPromptSourceProject: true}, // This protects source files in the shadow source project from being cleaned // Only true for the shadow source project itself (e.g., aindex)
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
        logger.error('failed to scan shadow projects', {path: shadowProjectsDir, error: e})
      }
    }

    if (shadowProjects.length === 0 && fs.existsSync(workspaceDir) && fs.statSync(workspaceDir).isDirectory()) { // This ensures clean command can find all projects even when dist/app/ is empty // If no projects found in dist/app/, fallback to scanning workspace directory
      logger.debug('no projects in dist/app/, falling back to workspace scan', {workspaceDir})
      try {
        const entries = fs.readdirSync(workspaceDir, {withFileTypes: true})
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            const isTheShadowSourceProject = entry.name === shadowSourceProjectName
            const projectConfig = this.loadProjectConfig(entry.name, shadowProjectDir, options.shadowSourceProject.project.src, fs, path, logger)

            shadowProjects.push({
              name: entry.name,
              ...isTheShadowSourceProject && {isPromptSourceProject: true},
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
        logger.error('failed to scan workspace directory', {path: workspaceDir, error: e})
      }
    }

    const workspace: Workspace = {
      directory: {
        pathKind: FilePathKind.Absolute,
        path: workspaceDir,
        getDirectoryName: () => path.basename(workspaceDir)
      },
      projects: shadowProjects
    }

    return {workspace}
  }
}
