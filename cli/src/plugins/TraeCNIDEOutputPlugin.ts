import type {
  OutputFileDeclaration,
  OutputWriteContext
} from './plugin-core'
import {AbstractOutputPlugin} from './plugin-core'

const GLOBAL_MEMORY_FILE = 'GLOBAL.md'
const GLOBAL_CONFIG_DIR = '.trae-cn'
const USER_RULES_SUBDIR = 'user_rules'

export class TraeCNIDEOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('TraeCNIDEOutputPlugin', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
      outputFileName: GLOBAL_MEMORY_FILE,
      dependsOn: ['TraeIDEOutputPlugin'],
      cleanup: {
        delete: {
          global: {
            dirs: ['.trae-cn/user_rules']
          }
        }
      },
      capabilities: {
        prompt: {
          scopes: ['global'],
          singleScope: false
        }
      }
    })
  }

  private getGlobalUserRulesDir(): string {
    return this.joinPath(this.getGlobalConfigDir(), USER_RULES_SUBDIR)
  }

  override async declareOutputFiles(ctx: OutputWriteContext): Promise<OutputFileDeclaration[]> {
    const activePromptScopes = new Set(this.selectPromptScopes(ctx, ['global']))
    if (!activePromptScopes.has('global')) return []

    const {globalMemory} = ctx.collectedOutputContext
    if (globalMemory == null) return []

    return [{
      path: this.joinPath(this.getGlobalUserRulesDir(), GLOBAL_MEMORY_FILE),
      scope: 'global',
      source: {content: globalMemory.content as string}
    }]
  }

  override async convertContent(
    declaration: OutputFileDeclaration,
    _ctx: OutputWriteContext
  ): Promise<string> {
    const source = declaration.source as {content?: string}
    if (source.content == null) throw new Error(`Unsupported declaration source for ${this.name}`)
    return source.content
  }
}
