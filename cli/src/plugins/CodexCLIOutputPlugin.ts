import type {
  CommandPrompt,
  OutputFileDeclaration,
  OutputWriteContext
} from './plugin-core'
import * as path from 'node:path'
import {AbstractOutputPlugin, filterByProjectConfig, PLUGIN_NAMES} from './plugin-core'

const PROJECT_MEMORY_FILE = 'AGENTS.md'
const GLOBAL_CONFIG_DIR = '.codex'
const PROMPTS_SUBDIR = 'prompts'

type CodexOutputSource
  = {readonly kind: 'globalMemory', readonly content: string}
    | {readonly kind: 'command', readonly command: CommandPrompt}

export class CodexCLIOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('CodexCLIOutputPlugin', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
      outputFileName: PROJECT_MEMORY_FILE,
      commands: {
        subDir: PROMPTS_SUBDIR,
        transformFrontMatter: (_cmd, context) => context.sourceFrontMatter ?? {}
      },
      cleanup: {
        delete: {
          global: {
            files: ['.codex/AGENTS.md'],
            dirs: ['.codex/prompts']
          }
        },
        protect: {
          global: {
            dirs: ['.codex/skills/.system']
          }
        }
      },
      dependsOn: [PLUGIN_NAMES.AgentsOutput],
      capabilities: {
        prompt: {
          scopes: ['global'],
          singleScope: false
        },
        commands: {
          scopes: ['project', 'workspace', 'global'],
          singleScope: true
        }
      }
    })
  }

  override async declareOutputFiles(ctx: OutputWriteContext): Promise<OutputFileDeclaration[]> {
    const {globalMemory, commands} = ctx.collectedOutputContext
    const globalDir = this.getGlobalConfigDir()
    const declarations: OutputFileDeclaration[] = []
    const activePromptScopes = new Set(this.selectPromptScopes(ctx, ['global']))

    if (globalMemory != null && activePromptScopes.has('global')) {
      declarations.push({
        path: path.join(globalDir, PROJECT_MEMORY_FILE),
        scope: 'global',
        source: {
          kind: 'globalMemory',
          content: globalMemory.content as string
        } satisfies CodexOutputSource
      })
    }

    if (commands == null || commands.length === 0) return declarations

    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const transformOptions = this.getTransformOptionsFromContext(ctx)
    const scopedCommands = this.selectSingleScopeItems(commands, this.commandsConfig.sourceScopes, cmd => this.resolveCommandSourceScope(cmd), this.getTopicScopeOverride(ctx, 'commands'))
    if (scopedCommands.items.length === 0) return declarations

    const filteredCommands = filterByProjectConfig(scopedCommands.items, projectConfig, 'commands')
    for (const cmd of filteredCommands) {
      const fileName = this.transformCommandName(cmd, transformOptions)
      declarations.push({
        path: path.join(globalDir, PROMPTS_SUBDIR, fileName),
        scope: 'global',
        source: {
          kind: 'command',
          command: cmd
        } satisfies CodexOutputSource
      })
    }

    return declarations
  }

  override async convertContent(
    declaration: OutputFileDeclaration,
    ctx: OutputWriteContext
  ): Promise<string> {
    const source = declaration.source as CodexOutputSource

    if (source.kind === 'globalMemory') return source.content
    if (source.kind === 'command') return this.buildCommandContent(source.command, ctx)

    throw new Error(`Unsupported declaration source for ${this.name}`)
  }
}
