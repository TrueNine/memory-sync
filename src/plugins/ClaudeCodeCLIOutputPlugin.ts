import {BaseCLIOutputPlugin} from './BaseCLIOutputPlugin'

const PROJECT_MEMORY_FILE = 'CLAUDE.md'
const GLOBAL_CONFIG_DIR = '.claude'

export class ClaudeCodeCLIOutputPlugin extends BaseCLIOutputPlugin {
  constructor() {
    super('ClaudeCodeCLIOutputPlugin', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
      outputFileName: PROJECT_MEMORY_FILE,
      toolPreset: 'claudeCode',
      supportsFastCommands: true,
      supportsSubAgents: true,
      supportsSkills: true
    })
  }
}
