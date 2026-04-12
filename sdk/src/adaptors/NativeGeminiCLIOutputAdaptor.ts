import type {
  OutputCleanContext,
  OutputCleanupDeclarations,
  OutputDeclarationScope,
  OutputFileDeclaration,
  OutputWriteContext
} from './adaptor-core'
import {getNativeBinding} from '@/core/native-binding'
import {AbstractOutputAdaptor} from './adaptor-core'

interface NativeGeminiOutputBinding {
  readonly collectGeminiOutputPlan?: (
    contextJson: string
  ) => string | Promise<string>
}

interface NativeGeminiOutputFilePlan {
  readonly path: string
  readonly scope?: OutputDeclarationScope
  readonly content: string
}

interface NativeGeminiOutputPlan {
  readonly pluginName: string
  readonly outputFiles: readonly NativeGeminiOutputFilePlan[]
  readonly cleanup: OutputCleanupDeclarations
}

const geminiOutputPlanCache = new WeakMap<object, Promise<NativeGeminiOutputPlan>>()

function requireNativeGeminiOutputBinding(): Required<NativeGeminiOutputBinding> {
  const binding = getNativeBinding<NativeGeminiOutputBinding>()
  if (binding?.collectGeminiOutputPlan == null) {
    throw new TypeError('Native Gemini output planner binding is required. Rebuild the Rust NAPI package before running tnmsc.')
  }
  return binding as Required<NativeGeminiOutputBinding>
}

async function getGeminiOutputPlan(
  ctx: Pick<OutputWriteContext | OutputCleanContext, 'collectedOutputContext'>
): Promise<NativeGeminiOutputPlan> {
  const cacheKey = ctx.collectedOutputContext as object
  let planPromise = geminiOutputPlanCache.get(cacheKey)
  if (planPromise != null) return planPromise

  const binding = requireNativeGeminiOutputBinding()
  planPromise = Promise.resolve(
    binding.collectGeminiOutputPlan(JSON.stringify(ctx.collectedOutputContext))
  ).then(raw => JSON.parse(raw) as NativeGeminiOutputPlan)
  geminiOutputPlanCache.set(cacheKey, planPromise)
  return planPromise
}

export class NativeGeminiCLIOutputAdaptor extends AbstractOutputAdaptor {
  constructor() {
    super('GeminiCLIOutputAdaptor', {
      globalConfigDir: '.gemini',
      outputFileName: 'GEMINI.md',
      treatWorkspaceRootProjectAsProject: true,
      capabilities: {
        prompt: {
          scopes: ['project', 'global'],
          singleScope: false
        }
      }
    })
  }

  override async declareOutputFiles(
    ctx: OutputWriteContext
  ): Promise<OutputFileDeclaration[]> {
    const plan = await getGeminiOutputPlan(ctx)
    return plan.outputFiles.map(outputFile => ({
      path: outputFile.path,
      source: {content: outputFile.content},
      ...outputFile.scope == null ? {} : {scope: outputFile.scope}
    }))
  }

  override async declareCleanupPaths(
    ctx: OutputCleanContext
  ): Promise<OutputCleanupDeclarations> {
    const plan = await getGeminiOutputPlan(ctx)
    return plan.cleanup
  }

  override async convertContent(
    declaration: OutputFileDeclaration,
    ctx: OutputWriteContext
  ): Promise<string> {
    void ctx
    const source = declaration.source as {content?: string}
    if (source.content == null) {
      throw new Error(`Unsupported declaration source for ${this.name}`)
    }
    return source.content
  }
}
