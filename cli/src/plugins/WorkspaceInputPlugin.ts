import type {CollectedInputContext, InputPluginContext, Workspace} from '@/types'
import * as path from 'node:path'
import {
  FilePathKind
} from '@/types'
import {AbstractInputPlugin} from './AbstractInputPlugin'

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
