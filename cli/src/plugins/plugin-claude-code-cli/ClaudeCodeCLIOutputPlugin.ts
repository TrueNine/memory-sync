import type {RulePrompt} from '../plugin-core'
import {doubleQuoted} from '@truenine/md-compiler/markdown'
import {AbstractOutputPlugin} from '../plugin-core'

const PROJECT_MEMORY_FILE = 'CLAUDE.md'
const GLOBAL_CONFIG_DIR = '.claude'
const COMMANDS_SUBDIR = 'commands'
const SKILLS_SUBDIR = 'skills'

/**
 * Output plugin for Claude Code CLI.
 *
 * Outputs rules to `.claude/rules/` directory with frontmatter format.
 *
 * @see https://github.com/anthropics/claude-code/issues/26868
 * Known bug: Claude Code CLI has issues with `.claude/rules` directory handling.
 * This may affect rule loading behavior in certain scenarios.
 */
export class ClaudeCodeCLIOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('ClaudeCodeCLIOutputPlugin', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
      outputFileName: PROJECT_MEMORY_FILE,
      toolPreset: 'claudeCode',
      supportsCommands: true,
      supportsSkills: true,
      commandsSubDir: COMMANDS_SUBDIR,
      skillsSubDir: SKILLS_SUBDIR,
      rules: {
        enabled: true,
        transformFrontMatter: (rule: RulePrompt) => ({paths: rule.globs.map(doubleQuoted)})
      }
    })
  }
}
