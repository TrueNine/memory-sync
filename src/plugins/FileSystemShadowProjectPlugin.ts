import type { Logger } from '@/log'
import type { CollectedInputContext, InputPlugin, InputPluginContext, Project, Workspace } from '@/types'

import {
  DEFAULT_SHADOW_SOURCE_PROJECT_DIR,
} from '@/constants'
import { createLogger } from '@/log'
import {
  FilePathKind,
  PluginKind,

} from '@/types'
import { resolveBasePaths, resolvePath } from '@/utils/pathUtils'

export class FileSystemShadowProjectPlugin implements InputPlugin {
  readonly type = PluginKind.Input
  readonly name = 'FileSystemShadowProjectPlugin'
  readonly log: Logger

  constructor() {
    this.log = createLogger(this.name)
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const { userConfigOptions: options, logger, fs, path } = ctx
    const { workspaceDir, shadowProjectDir } = resolveBasePaths(options)

    const shadowSourceProjectDirRaw = options.shadowSourceProjectDir ?? DEFAULT_SHADOW_SOURCE_PROJECT_DIR
    const shadowSourceProjectDir = resolvePath(shadowSourceProjectDirRaw, workspaceDir, shadowProjectDir)

    const shadowProjects: Project[] = []
    if (fs.existsSync(shadowSourceProjectDir) && fs.statSync(shadowSourceProjectDir).isDirectory()) {
      try {
        const entries = fs.readdirSync(shadowSourceProjectDir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory()) {
            shadowProjects.push({
              name: entry.name,
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
