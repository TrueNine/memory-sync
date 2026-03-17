import type {AIAgentIgnoreConfigFile, InputCapabilityContext, InputCollectedContext} from '../plugins/plugin-core'
import {AbstractInputCapability} from '../plugins/plugin-core'
import {AI_AGENT_IGNORE_TARGET_RELATIVE_PATHS, resolvePublicDefinitionPath} from '../public-config-paths'

export class AIAgentIgnoreInputCapability extends AbstractInputCapability {
  constructor() {
    super('AIAgentIgnoreInputCapability')
  }

  collect(ctx: InputCapabilityContext): Partial<InputCollectedContext> {
    const {workspaceDir, aindexDir} = this.resolveBasePaths(ctx.userConfigOptions)
    const results: AIAgentIgnoreConfigFile[] = []

    for (const fileName of AI_AGENT_IGNORE_TARGET_RELATIVE_PATHS) {
      const filePath = resolvePublicDefinitionPath(aindexDir, fileName, {
        command: ctx.runtimeCommand,
        workspaceDir
      })
      if (!ctx.fs.existsSync(filePath)) {
        this.log.debug({action: 'collect', message: 'Ignore file not found', path: filePath})
        continue
      }
      const content = ctx.fs.readFileSync(filePath, 'utf8')
      if (content.length === 0) {
        this.log.debug({action: 'collect', message: 'Ignore file is empty', path: filePath})
        continue
      }
      results.push({fileName, content, sourcePath: filePath})
      this.log.debug({action: 'collect', message: 'Loaded ignore file', path: filePath, fileName})
    }

    if (results.length === 0) return {}
    return {aiAgentIgnoreConfigFiles: results}
  }
}
