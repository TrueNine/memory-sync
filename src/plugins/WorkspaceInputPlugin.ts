import type { CollectedInputContext, InputPluginContext, Project, Workspace } from '@/types'
import * as path from 'node:path'
import {
  FilePathKind,
} from '@/types'
import { AbstractInputPlugin } from './AbstractInputPlugin'

export class WorkspaceInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('WorkspaceInputPlugin')
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const { userConfigOptions: options } = ctx
    const { workspaceDir, shadowProjectDir } = this.resolveBasePaths(options)

    const externalProjects = (options.externalProjects || []).map((p) => {
      const resolved = this.resolvePath(p, workspaceDir, shadowProjectDir)
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
      shadowProjectDir,
      ...(externalProjects.length > 0 && { externalProjects }),
    }
  }
}
