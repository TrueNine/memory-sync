import type {InputCapabilityContext, InputCollectedContext} from '../plugins/plugin-core'
import {AbstractInputCapability} from '../plugins/plugin-core'
import {PUBLIC_GIT_EXCLUDE_TARGET_RELATIVE_PATH, resolvePublicDefinitionPath} from '../public-config-paths'

export class GitExcludeInputCapability extends AbstractInputCapability {
  constructor() {
    super('GitExcludeInputCapability')
  }

  collect(ctx: InputCapabilityContext): Partial<InputCollectedContext> {
    const {workspaceDir, aindexDir} = this.resolveBasePaths(ctx.userConfigOptions)
    const filePath = resolvePublicDefinitionPath(aindexDir, PUBLIC_GIT_EXCLUDE_TARGET_RELATIVE_PATH, {
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
    return {shadowGitExclude: content}
  }
}
