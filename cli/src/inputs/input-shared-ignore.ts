import type {AIAgentIgnoreConfigFile, CollectedInputContext, InputPluginContext} from '../plugins/plugin-core'
import {AbstractInputPlugin} from '../plugins/plugin-core'
import {AINDEX_FILE_NAMES} from '../plugins/plugin-core'

const IGNORE_FILE_NAMES: readonly string[] = [
  AINDEX_FILE_NAMES.QODER_IGNORE,
  AINDEX_FILE_NAMES.CURSOR_IGNORE,
  AINDEX_FILE_NAMES.WARP_INDEX_IGNORE,
  AINDEX_FILE_NAMES.AI_IGNORE,
  AINDEX_FILE_NAMES.CODEIUM_IGNORE,
  '.kiroignore',
  '.traeignore'
] as const

export class AIAgentIgnoreInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('AIAgentIgnoreInputPlugin')
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const {aindexDir} = this.resolveBasePaths(ctx.userConfigOptions)
    const results: AIAgentIgnoreConfigFile[] = []

    for (const fileName of IGNORE_FILE_NAMES) {
      const filePath = ctx.path.join(aindexDir, fileName)
      if (!ctx.fs.existsSync(filePath)) {
        this.log.debug({action: 'collect', message: 'Ignore file not found', path: filePath})
        continue
      }
      const content = ctx.fs.readFileSync(filePath, 'utf8')
      if (content.length === 0) {
        this.log.debug({action: 'collect', message: 'Ignore file is empty', path: filePath})
        continue
      }
      results.push({fileName, content})
      this.log.debug({action: 'collect', message: 'Loaded ignore file', path: filePath, fileName})
    }

    if (results.length === 0) return {}
    return {aiAgentIgnoreConfigFiles: results}
  }
}
