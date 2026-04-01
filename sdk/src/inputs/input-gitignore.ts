import type {InputCapabilityContext, InputCollectedContext} from '../plugins/plugin-core'
import {AbstractInputCapability} from '../plugins/plugin-core'
import {PUBLIC_GIT_IGNORE_TARGET_RELATIVE_PATH, resolvePublicDefinitionPath} from '../public-config-paths'

export class GitIgnoreInputCapability extends AbstractInputCapability {
  constructor() {
    super('GitIgnoreInputCapability')
  }

  collect(ctx: InputCapabilityContext): Partial<InputCollectedContext> {
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
