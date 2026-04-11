import type {
  OutputCleanContext,
  OutputCleanupDeclarations,
  OutputDeclarationScope,
  OutputFileDeclaration,
  OutputWriteContext
} from './adaptor-core'
import {Buffer} from 'node:buffer'
import {getNativeBinding} from '@/core/native-binding'
import {AbstractOutputAdaptor} from './adaptor-core'

interface NativeDroidOutputBinding {
  readonly collectDroidOutputPlan?: (
    contextJson: string
  ) => string | Promise<string>
}

interface NativeDroidOutputFilePlan {
  readonly path: string
  readonly scope?: OutputDeclarationScope
  readonly content: string
  readonly encoding?: 'text' | 'base64'
}

interface NativeDroidOutputPlan {
  readonly pluginName: string
  readonly outputFiles: readonly NativeDroidOutputFilePlan[]
  readonly cleanup: OutputCleanupDeclarations
}

const droidOutputPlanCache = new WeakMap<object, Promise<NativeDroidOutputPlan>>()

function requireNativeDroidOutputBinding(): Required<NativeDroidOutputBinding> {
  const binding = getNativeBinding<NativeDroidOutputBinding>()
  if (binding?.collectDroidOutputPlan == null) {
    throw new TypeError('Native Droid output planner binding is required. Rebuild the Rust NAPI package before running tnmsc.')
  }
  return binding as Required<NativeDroidOutputBinding>
}

async function getDroidOutputPlan(
  ctx: Pick<OutputWriteContext | OutputCleanContext, 'collectedOutputContext'>
): Promise<NativeDroidOutputPlan> {
  const cacheKey = ctx.collectedOutputContext as object
  let planPromise = droidOutputPlanCache.get(cacheKey)
  if (planPromise != null) return planPromise

  const binding = requireNativeDroidOutputBinding()
  planPromise = Promise.resolve(
    binding.collectDroidOutputPlan(JSON.stringify(ctx.collectedOutputContext))
  ).then(raw => JSON.parse(raw) as NativeDroidOutputPlan)
  droidOutputPlanCache.set(cacheKey, planPromise)
  return planPromise
}

export class NativeDroidCLIOutputAdaptor extends AbstractOutputAdaptor {
  constructor() {
    super('DroidCLIOutputAdaptor', {
      globalConfigDir: '.factory',
      outputFileName: 'AGENTS.md',
      treatWorkspaceRootProjectAsProject: true,
      capabilities: {
        prompt: {
          scopes: ['project', 'global'],
          singleScope: false
        },
        commands: {
          scopes: ['project', 'global'],
          singleScope: true
        },
        skills: {
          scopes: ['project', 'global'],
          singleScope: true
        }
      }
    })
  }

  override async declareOutputFiles(
    ctx: OutputWriteContext
  ): Promise<OutputFileDeclaration[]> {
    const plan = await getDroidOutputPlan(ctx)
    return plan.outputFiles.map(outputFile => ({
      path: outputFile.path,
      source: {
        content: outputFile.content,
        encoding: outputFile.encoding
      },
      ...outputFile.scope == null ? {} : {scope: outputFile.scope}
    }))
  }

  override async declareCleanupPaths(
    ctx: OutputCleanContext
  ): Promise<OutputCleanupDeclarations> {
    const plan = await getDroidOutputPlan(ctx)
    return plan.cleanup
  }

  override async convertContent(
    declaration: OutputFileDeclaration,
    ctx: OutputWriteContext
  ): Promise<string | Buffer> {
    void ctx
    const source = declaration.source as {
      readonly content?: string
      readonly encoding?: 'text' | 'base64'
    }

    if (source.content == null) {
      throw new Error(`Unsupported declaration source for ${this.name}`)
    }

    if (source.encoding === 'base64') {
      return Buffer.from(source.content, 'base64')
    }

    return source.content
  }
}
