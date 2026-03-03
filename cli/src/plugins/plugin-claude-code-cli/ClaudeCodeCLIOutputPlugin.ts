import type {RulePrompt} from '../plugin-shared'
import {doubleQuoted} from '@truenine/md-compiler/markdown'
import {AbstractOutputPlugin} from '@truenine/plugin-output-shared'

const PROJECT_MEMORY_FILE = 'CLAUDE.md'
const GLOBAL_CONFIG_DIR = '.claude'
const COMMANDS_SUBDIR = 'commands'
const AGENTS_SUBDIR = 'agents'
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
      supportsSubAgents: true,
      supportsSkills: true,
      commandsSubDir: COMMANDS_SUBDIR,
      agentsSubDir: AGENTS_SUBDIR,
      skillsSubDir: SKILLS_SUBDIR,
      rules: {
        enabled: true,
        transformFrontMatter: (rule: RulePrompt) => rule.globs.length > 0 ? {paths: rule.globs.map(doubleQuoted)} : {} // Custom frontmatter transformer for Claude Code CLI format
      }
    })
  }
}
