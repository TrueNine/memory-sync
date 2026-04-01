import type {InputCapabilityContext, InputCollectedContext, Workspace} from '../plugins/plugin-core'
import * as path from 'node:path'
import {AbstractInputCapability, FilePathKind} from '../plugins/plugin-core'

export class WorkspaceInputCapability extends AbstractInputCapability {
  constructor() {
    super('WorkspaceInputCapability')
  }

  collect(ctx: InputCapabilityContext): Partial<InputCollectedContext> {
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
