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
      commands: {
        subDir: COMMANDS_SUBDIR,
        transformFrontMatter: (_cmd, context) => context.sourceFrontMatter ?? {}
      },
      skills: {
        subDir: SKILLS_SUBDIR
      },
      rules: {
        transformFrontMatter: (rule: RulePrompt) => ({paths: rule.globs.map(doubleQuoted)})
      },
      capabilities: {
        prompt: {
          scopes: ['project', 'global'],
          singleScope: false
        },
        rules: {
          scopes: ['project', 'workspace', 'global'],
          singleScope: false
        },
        commands: {
          scopes: ['project', 'workspace', 'global'],
          singleScope: true
        },
        skills: {
          scopes: ['project', 'workspace', 'global'],
          singleScope: true
        }
      }
    })
  }
}
