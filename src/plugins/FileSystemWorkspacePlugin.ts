import type { Logger } from '@/log'
import type { CollectedInputContext, InputPlugin, InputPluginContext, Project, Workspace } from '@/types'
import * as path from 'node:path'
import { createLogger } from '@/log'
import {
  FilePathKind,
  PluginKind,
} from '@/types'
import { resolveBasePaths, resolvePath } from '@/utils/pathUtils'

export class FileSystemWorkspacePlugin implements InputPlugin {
  readonly type = PluginKind.Input
  readonly name = 'FileSystemWorkspacePlugin'
  readonly log: Logger

  constructor() {
    this.log = createLogger(this.name)
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const { userConfigOptions: options } = ctx
    const { workspaceDir, shadowProjectDir } = resolveBasePaths(options)

    const externalProjects = (options.externalProjects || []).map((p) => {
      const resolved = resolvePath(p, workspaceDir, shadowProjectDir)
      return {
        name: path.basename(resolved),
        dirFromWorkspacePath: {
          pathKind: FilePathKind.Relative,
          path: resolved,
          basePath: workspaceDir,
          getDirectoryName: () => path.basename(resolved),
        },
      } as Project
    })

    const workspace: Workspace = {
      directory: {
        pathKind: FilePathKind.Absolute,
        path: workspaceDir,
        getDirectoryName: () => path.basename(workspaceDir),
      },
      projects: [],
    }

    return {
      workspace,
      ...(externalProjects.length > 0 && { externalProjects }),
    }
  }
}
