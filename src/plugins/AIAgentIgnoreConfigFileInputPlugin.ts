import type {
  AIAgentIgnoreConfigFile,
  CollectedInputContext,
  InputPluginContext,
} from '@/types'

import { AbstractInputPlugin } from './AbstractInputPlugin'

/**
 * Ignore file names to read from shadow project dist directory
 */
const IGNORE_FILE_NAMES = ['.qoderignore', '.cursorignore', '.warpindexignore'] as const

export class AIAgentIgnoreConfigFileInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('AIAgentIgnoreConfigFileInputPlugin')
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const { userConfigOptions: options, logger, fs, path } = ctx
    const { shadowProjectDir } = this.resolveBasePaths(options)

    const ignoreFiles: AIAgentIgnoreConfigFile[] = []

    // Read ignore files from shadow project root directory: $SHADOW_PROJECT/
    for (const fileName of IGNORE_FILE_NAMES) {
      const filePath = path.join(shadowProjectDir, fileName)

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8')
          ignoreFiles.push({ fileName, content })
          logger.debug(`Read ignore file: ${filePath}`)
        } catch (e) {
          logger.warn(`Failed to read ignore file ${filePath}`, { error: e })
        }
      }
    }

    return {
      aiAgentIgnoreConfigFiles: ignoreFiles,
    }
  }
}
