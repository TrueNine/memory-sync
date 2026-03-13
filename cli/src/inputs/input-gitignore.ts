import type {InputCollectedContext, InputPluginContext} from '../plugins/plugin-core'
import {AbstractInputPlugin} from '../plugins/plugin-core'
import {PUBLIC_GIT_IGNORE_TARGET_RELATIVE_PATH, resolvePublicDefinitionPath} from '../public-config-paths'

export class GitIgnoreInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('GitIgnoreInputPlugin')
  }

  collect(ctx: InputPluginContext): Partial<InputCollectedContext> {
    const {workspaceDir, aindexDir} = this.resolveBasePaths(ctx.userConfigOptions)
    const filePath = resolvePublicDefinitionPath(aindexDir, PUBLIC_GIT_IGNORE_TARGET_RELATIVE_PATH, {
      command: ctx.runtimeCommand,
      workspaceDir
    })

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
