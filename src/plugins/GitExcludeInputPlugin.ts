import type {CollectedInputContext, InputPluginContext} from '@/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {AbstractInputPlugin} from './AbstractInputPlugin'

/**
 * Input plugin that reads git exclude patterns from shadow source project.
 * Reads from `public/exclude` file in the shadow project directory.
 *
 * This content will be merged with existing `.git/info/exclude` by GitExcludeOutputPlugin.
 */
export class GitExcludeInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('GitExcludeInputPlugin')
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const {shadowProjectDir} = this.resolveBasePaths(ctx.userConfigOptions)
    const excludePath = path.join(shadowProjectDir, 'public', 'exclude')

    if (!fs.existsSync(excludePath)) {
      this.log.debug({action: 'collect', message: 'No exclude file found in shadow project', path: excludePath})
      return {}
    }

    const content = fs.readFileSync(excludePath, 'utf8')

    if (content.length === 0) {
      this.log.debug({action: 'collect', message: 'Exclude file is empty', path: excludePath})
      return {}
    }

    this.log.debug({action: 'collect', message: 'Loaded git exclude from shadow project', path: excludePath})

    return {
      shadowGitExclude: content,
    }
  }
}
