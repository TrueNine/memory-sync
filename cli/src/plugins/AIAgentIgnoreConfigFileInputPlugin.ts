import type {
  AIAgentIgnoreConfigFile,
  CollectedInputContext,
  InputPluginContext
} from '@/types'

import {AbstractInputPlugin} from './AbstractInputPlugin'

/**
 * Ignore file names to read from shadow project dist directory
 *
 * @see https://docs.windsurf.com/context-awareness/windsurf-ignore#windsurf-ignore - Windsurf uses `.codeiumignore`
 */
const IGNORE_FILE_NAMES = ['.qoderignore', '.cursorignore', '.kiroignore', '.warpindexignore', '.aiignore', '.codeiumignore', '.traeignore'] as const

export class AIAgentIgnoreConfigFileInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('AIAgentIgnoreConfigFileInputPlugin')
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const {userConfigOptions: options, logger, fs, path} = ctx
    const {shadowProjectDir} = this.resolveBasePaths(options)

    const ignoreFiles: AIAgentIgnoreConfigFile[] = []

    for (const fileName of IGNORE_FILE_NAMES) { // Read ignore files from shadow source project root directory: $SHADOW_SOURCE_PROJECT/
      const filePath = path.join(shadowProjectDir, fileName)

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        try {
          const content = fs.readFileSync(filePath, 'utf8')
          ignoreFiles.push({fileName, content})
          logger.debug('read ignore file', {path: filePath})
        }
        catch (e) {
          logger.warn('failed to read ignore file', {path: filePath, error: e})
        }
      }
    }

    return {
      aiAgentIgnoreConfigFiles: ignoreFiles
    }
  }
}
