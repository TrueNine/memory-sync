import {BaseCLIOutputPlugin} from './BaseCLIOutputPlugin'

const PROJECT_MEMORY_FILE = 'GEMINI.md'
const GLOBAL_CONFIG_DIR = '.gemini'

export class GeminiCLIOutputPlugin extends BaseCLIOutputPlugin {
  constructor() {
    super('GeminiCLIOutputPlugin', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
      outputFileName: PROJECT_MEMORY_FILE,
      supportsFastCommands: false,
      supportsSubAgents: false,
      supportsSkills: false
    })
  }
}
