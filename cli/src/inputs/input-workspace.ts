import type {CollectedInputContext, InputPluginContext, Workspace} from '../plugins/plugin-shared'
import * as path from 'node:path'
import {AbstractInputPlugin} from '@truenine/plugin-input-shared'
import {FilePathKind} from '../plugins/plugin-shared'

export class WorkspaceInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('WorkspaceInputPlugin')
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const {userConfigOptions: options} = ctx
    const {workspaceDir, aindexDir} = this.resolveBasePaths(options)

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
      aindexDir
    }
  }
}
