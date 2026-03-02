import type {CollectedInputContext, InputPluginContext, Workspace} from '@truenine/plugin-shared'
import * as path from 'node:path'
import {AbstractInputPlugin} from '@truenine/plugin-input-shared'
import {FilePathKind} from '@truenine/plugin-shared'

export class WorkspaceInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('WorkspaceInputPlugin')
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const {userConfigOptions: options} = ctx
    const {workspaceDir, shadowProjectDir} = this.resolveBasePaths(options)

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
      shadowSourceProjectDir: shadowProjectDir
    }
  }
}
