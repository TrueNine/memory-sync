import type { CollectedInputContext, InputPluginContext, Project, Workspace } from '@/types'

import {
  DEFAULT_SHADOW_PROJECTS_DIR,
} from '@/constants'
import {
  FilePathKind,
} from '@/types'
import { AbstractInputPlugin } from './AbstractInputPlugin'

export class ShadowProjectInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('ShadowProjectInputPlugin')
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const { userConfigOptions: options, logger, fs, path } = ctx
    const { workspaceDir, shadowProjectDir } = this.resolveBasePaths(options)

    const shadowProjectsDirRaw = options.shadowProjectsDir ?? DEFAULT_SHADOW_PROJECTS_DIR
    const shadowProjectsDir = this.resolvePath(shadowProjectsDirRaw, workspaceDir, shadowProjectDir)

    // Get the shadow source project name (e.g., "aindex") from shadowProjectDir
    const shadowSourceProjectName = path.basename(shadowProjectDir)

    const shadowProjects: Project[] = []
    if (fs.existsSync(shadowProjectsDir) && fs.statSync(shadowProjectsDir).isDirectory()) {
      try {
        const entries = fs.readdirSync(shadowProjectsDir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory()) {
            // Only mark the shadow source project itself (e.g., aindex) as prompt source project
            // Other projects should have their output files cleaned normally
            const isTheShadowSourceProject = entry.name === shadowSourceProjectName

            shadowProjects.push({
              name: entry.name,
              // Only true for the shadow source project itself (e.g., aindex)
              // This protects source files in the shadow source project from being cleaned
              ...(isTheShadowSourceProject && { isPromptSourceProject: true }),
              dirFromWorkspacePath: {
                pathKind: FilePathKind.Relative,
                path: entry.name,
                basePath: workspaceDir,
                getDirectoryName: () => entry.name,
                getAbsolutePath: () => path.resolve(workspaceDir, entry.name),
              },
            })
          }
        }
      } catch (e) {
        logger.error('failed to scan shadow projects', { path: shadowProjectsDir, error: e })
      }
    }

    const workspace: Workspace = {
      directory: {
        pathKind: FilePathKind.Absolute,
        path: workspaceDir,
        getDirectoryName: () => path.basename(workspaceDir),
      },
      projects: shadowProjects,
    }

    return { workspace }
  }
}
