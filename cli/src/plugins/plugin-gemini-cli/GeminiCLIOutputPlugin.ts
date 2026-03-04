import {AbstractOutputPlugin} from '../plugin-core'

const PROJECT_MEMORY_FILE = 'GEMINI.md'
const GLOBAL_CONFIG_DIR = '.gemini'

export class GeminiCLIOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('GeminiCLIOutputPlugin', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
      outputFileName: PROJECT_MEMORY_FILE,
      supportsCommands: false,
      supportsSkills: false
    })
  }
}
