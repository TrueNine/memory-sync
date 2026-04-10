import type {
  OutputCleanContext,
  OutputCleanupDeclarations
} from './adaptor-core'
import {AbstractOutputAdaptor} from './adaptor-core'

const PROJECT_MEMORY_FILE = 'GEMINI.md'
const GLOBAL_CONFIG_DIR = '.gemini'

export class GeminiCLIOutputAdaptor extends AbstractOutputAdaptor {
  constructor() {
    super('GeminiCLIOutputAdaptor', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
      outputFileName: PROJECT_MEMORY_FILE,
      treatWorkspaceRootProjectAsProject: true,
      cleanup: {
        delete: {
          global: {
            files: ['.gemini/GEMINI.md']
          }
        }
      },
      capabilities: {
        prompt: {
          scopes: ['project', 'global'],
          singleScope: false
        }
      }
    })
  }

  override async declareCleanupPaths(
    ctx: OutputCleanContext
  ): Promise<OutputCleanupDeclarations> {
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
