import type {CollectedInputContext, InputPluginContext} from '../plugins/plugin-shared'
import * as path from 'node:path'
import {AbstractInputPlugin} from '@truenine/plugin-input-shared'

export class GitExcludeInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('GitExcludeInputPlugin')
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const {aindexDir} = this.resolveBasePaths(ctx.userConfigOptions)
    const filePath = path.join(aindexDir, 'public', 'exclude')

    if (!ctx.fs.existsSync(filePath)) {
      this.log.debug({action: 'collect', message: 'File not found', path: filePath})
      return {}
    }

    const content = ctx.fs.readFileSync(filePath, 'utf8')

    if (content.length === 0) {
      this.log.debug({action: 'collect', message: 'File is empty', path: filePath})
      return {}
    }

    this.log.debug({action: 'collect', message: 'Loaded file content', path: filePath, length: content.length})
    return {shadowGitExclude: content}
  }
}
