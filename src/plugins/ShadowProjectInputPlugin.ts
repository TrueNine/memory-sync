import type { CollectedInputContext, InputPluginContext, Project, Workspace } from '@/types'

import {
  DEFAULT_SHADOW_SOURCE_PROJECT_DIR,
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

    const shadowSourceProjectDirRaw = options.shadowSourceProjectDir ?? DEFAULT_SHADOW_SOURCE_PROJECT_DIR
    const shadowSourceProjectDir = this.resolvePath(shadowSourceProjectDirRaw, workspaceDir, shadowProjectDir)

    // Get the shadow project name (e.g., "aindex") from shadowProjectDir
    const shadowProjectName = path.basename(shadowProjectDir)

    const shadowProjects: Project[] = []
    if (fs.existsSync(shadowSourceProjectDir) && fs.statSync(shadowSourceProjectDir).isDirectory()) {
      try {
        const entries = fs.readdirSync(shadowSourceProjectDir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory()) {
            // Only mark the shadow project itself (e.g., aindex) as prompt source project
            // Other projects should have their output files cleaned normally
            const isTheShadowProject = entry.name === shadowProjectName

            shadowProjects.push({
              name: entry.name,
              // Only true for the shadow project itself (e.g., aindex)
              // This protects source files in the shadow project from being cleaned
              ...(isTheShadowProject && { isPromptSourceProject: true }),
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
        logger.error('failed to scan shadow source projects', { path: shadowSourceProjectDir, error: e })
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
