import type {CollectedInputContext, InputPluginContext, Project, Workspace} from 'memory-sync-cli/src/types'

import {
  FilePathKind
} from 'memory-sync-cli/src/types'
import {AbstractInputPlugin} from './AbstractInputPlugin'

export class ShadowProjectInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('ShadowProjectInputPlugin')
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const {userConfigOptions: options, logger, fs, path} = ctx
    const {workspaceDir, shadowProjectDir} = this.resolveBasePaths(options)

    const shadowProjectsDirRaw = options.shadowProjectsDir
    const shadowProjectsDir = this.resolvePath(shadowProjectsDirRaw, workspaceDir, shadowProjectDir)

    const shadowSourceProjectName = path.basename(shadowProjectDir) // Get the shadow source project name (e.g., "aindex") from shadowProjectDir

    const shadowProjects: Project[] = []

    if (fs.existsSync(shadowProjectsDir) && fs.statSync(shadowProjectsDir).isDirectory()) { // First, try to collect projects from dist/app/ directory
      try {
        const entries = fs.readdirSync(shadowProjectsDir, {withFileTypes: true})
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const isTheShadowSourceProject = entry.name === shadowSourceProjectName // Other projects should have their output files cleaned normally // Only mark the shadow source project itself (e.g., aindex) as prompt source project

            shadowProjects.push({
              name: entry.name,
              ...isTheShadowSourceProject && {isPromptSourceProject: true}, // This protects source files in the shadow source project from being cleaned // Only true for the shadow source project itself (e.g., aindex)
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

            shadowProjects.push({
              name: entry.name,
              ...isTheShadowSourceProject && {isPromptSourceProject: true},
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
