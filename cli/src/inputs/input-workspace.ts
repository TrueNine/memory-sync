import type {InputCollectedContext, InputPluginContext, Workspace} from '../plugins/plugin-core'
import * as path from 'node:path'
import {AbstractInputPlugin, FilePathKind} from '../plugins/plugin-core'

export class WorkspaceInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('WorkspaceInputPlugin')
  }

  collect(ctx: InputPluginContext): Partial<InputCollectedContext> {
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
