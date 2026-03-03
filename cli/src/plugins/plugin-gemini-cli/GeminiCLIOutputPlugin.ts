import {BaseCLIOutputPlugin} from '@truenine/plugin-output-shared'

const PROJECT_MEMORY_FILE = 'GEMINI.md'
const GLOBAL_CONFIG_DIR = '.gemini'

export class GeminiCLIOutputPlugin extends BaseCLIOutputPlugin {
  constructor() {
    super('GeminiCLIOutputPlugin', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
      outputFileName: PROJECT_MEMORY_FILE,
      supportsCommands: false,
      supportsSubAgents: false,
      supportsSkills: false
    })
  }
}
