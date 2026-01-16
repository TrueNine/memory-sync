import type {CollectedInputContext, InputPluginContext} from '@/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {AbstractInputPlugin} from './AbstractInputPlugin'

export class GitIgnoreInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('GitIgnoreInputPlugin')
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const {shadowProjectDir} = this.resolveBasePaths(ctx.userConfigOptions)
    const gitignorePath = path.join(shadowProjectDir, 'public', 'gitignore')

    let content: string | undefined

    if (fs.existsSync(gitignorePath)) {
      content = fs.readFileSync(gitignorePath, 'utf8')
      this.log.debug({action: 'collect', message: 'Loaded gitignore from shadow project file', path: gitignorePath})
    } else {
      content = __TEMPLATE_GITIGNORE__
      if (content) this.log.debug({action: 'collect', message: 'Using global gitignore template'})
    }

    if (content && content.length > 0) {
      return {
        globalGitIgnore: content,
      }
    }

    this.log.warn({action: 'collect', message: 'No gitignore content available'})
    return {}
  }
}
