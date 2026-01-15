import type {CollectedInputContext, InputPluginContext} from '@/types'
import {AbstractInputPlugin} from './AbstractInputPlugin'

export class GitIgnoreInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('GitIgnoreInputPlugin')
  }

  collect(_ctx: InputPluginContext): Partial<CollectedInputContext> {
    const content = __TEMPLATE_GITIGNORE__

    if (content) {
      this.log.debug({action: 'collect', message: 'Using global gitignore template'})
      return {
        globalGitIgnore: content,
      }
    }

    this.log.warn({action: 'collect', message: 'Global gitignore template is empty'})
    return {}
  }
}
