import type {OutputCleanContext, OutputCleanupDeclarations, RulePrompt} from './plugin-core'
import {doubleQuoted} from '@truenine/md-compiler/markdown'
import {AbstractOutputPlugin} from './plugin-core'

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
      treatWorkspaceRootProjectAsProject: true,
      toolPreset: 'claudeCode',
      commands: {
        subDir: COMMANDS_SUBDIR,
        transformFrontMatter: (_cmd, context) => context.sourceFrontMatter ?? {}
      },
      subagents: {
        subDir: AGENTS_SUBDIR,
        sourceScopes: ['project'],
        includePrefix: true,
        linkSymbol: '-',
        ext: '.md'
      },
      skills: {
        subDir: SKILLS_SUBDIR
      },
      rules: {
        transformFrontMatter: (rule: RulePrompt) => ({paths: rule.globs.map(doubleQuoted)})
      },
      cleanup: {
        delete: {
          project: {
            dirs: ['.claude/rules', '.claude/commands', '.claude/agents', '.claude/skills']
          },
          global: {
            files: ['.claude/CLAUDE.md'],
            dirs: ['.claude/rules', '.claude/commands', '.claude/agents', '.claude/skills']
          }
        }
      },
      wslMirrors: [
        '~/.claude/settings.json',
        '~/.claude/config.json'
      ],
      capabilities: {
        prompt: {
          scopes: ['project', 'global'],
          singleScope: false
        },
        rules: {
          scopes: ['project', 'global'],
          singleScope: false
        },
        commands: {
          scopes: ['project', 'global'],
          singleScope: true
        },
        subagents: {
          scopes: ['project'],
          singleScope: true
        },
        skills: {
          scopes: ['project', 'global'],
          singleScope: true
        }
      }
    })
  }

  override async declareCleanupPaths(ctx: OutputCleanContext): Promise<OutputCleanupDeclarations> {
    const declarations = await super.declareCleanupPaths(ctx)

    return {
      ...declarations,
      delete: [
        ...declarations.delete ?? [],
        ...this.buildProjectPromptCleanupTargets(ctx, PROJECT_MEMORY_FILE)
      ]
    }
  }
}
