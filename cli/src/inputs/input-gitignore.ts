import type {CollectedInputContext, InputPluginContext} from '@truenine/plugin-shared'
import * as path from 'node:path'
import {AbstractInputPlugin} from '@truenine/plugin-input-shared'

export class GitIgnoreInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('GitIgnoreInputPlugin')
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const {shadowProjectDir} = this.resolveBasePaths(ctx.userConfigOptions)
    const filePath = path.join(shadowProjectDir, 'public', 'gitignore')

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
    return {globalGitIgnore: content}
  }
}
