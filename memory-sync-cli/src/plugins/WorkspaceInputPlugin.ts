import type {CollectedInputContext, InputPluginContext, Project, Workspace} from 'memory-sync-cli/src/types'
import * as path from 'node:path'
import {
  FilePathKind
} from 'memory-sync-cli/src/types'
import {AbstractInputPlugin} from './AbstractInputPlugin'

export class WorkspaceInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('WorkspaceInputPlugin')
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const {userConfigOptions: options} = ctx
    const {workspaceDir, shadowProjectDir} = this.resolveBasePaths(options)

    const externalProjects = options.externalProjects.map(p => {
      const resolved = this.resolvePath(p, workspaceDir, shadowProjectDir)
      return {
        name: path.basename(resolved),
        dirFromWorkspacePath: {
          pathKind: FilePathKind.Relative,
          path: resolved,
          basePath: workspaceDir,
          getDirectoryName: () => path.basename(resolved)
        }
      } as Project
    })

    const workspace: Workspace = {
      directory: {
        pathKind: FilePathKind.Absolute,
        path: workspaceDir,
        getDirectoryName: () => path.basename(workspaceDir)
      },
      projects: []
    }

    return {
      workspace,
      shadowSourceProjectDir: shadowProjectDir,
      ...externalProjects.length > 0 && {externalProjects}
    }
  }
}
