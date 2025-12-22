import type { CollectedInputContext, InputPluginContext, Project, Workspace } from '@/types'

import {
  DEFAULT_SHADOW_SOURCE_PROJECT_DIR,
} from '@/constants'
import {
  FilePathKind,
} from '@/types'
import { AbstractInputPlugin } from './AbstractInputPlugin'

export class FileSystemShadowProjectPlugin extends AbstractInputPlugin {
  constructor() {
    super('FileSystemShadowProjectPlugin')
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const { userConfigOptions: options, logger, fs, path } = ctx
    const { workspaceDir, shadowProjectDir } = this.resolveBasePaths(options)

    const shadowSourceProjectDirRaw = options.shadowSourceProjectDir ?? DEFAULT_SHADOW_SOURCE_PROJECT_DIR
    const shadowSourceProjectDir = this.resolvePath(shadowSourceProjectDirRaw, workspaceDir, shadowProjectDir)

    const shadowProjects: Project[] = []
    if (fs.existsSync(shadowSourceProjectDir) && fs.statSync(shadowSourceProjectDir).isDirectory()) {
      try {
        const entries = fs.readdirSync(shadowSourceProjectDir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory()) {
            shadowProjects.push({
              name: entry.name,
              isShadowSourceProject: true,
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
        logger.error(`Failed to scan shadow source projects at ${shadowSourceProjectDir}`, { error: e })
      }
    }

    // Return a partial workspace update. The merger should handle merging projects.
    // However, if we don't have a merger yet, this might overwrite.
    // For now, I will assume the collector handles it, or I'll structure it so only one plugin provides 'projects' for now.
    // But wait, the original code had ONLY shadowProjects in workspace.projects?
    // Let's check FileSystemInputPlugin again.
    // const workspace: Workspace = { ..., projects: shadowProjects }
    // Yes, it seems only shadowProjects were there.

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
