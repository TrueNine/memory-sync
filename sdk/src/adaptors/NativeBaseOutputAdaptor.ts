import type {
  OutputCleanContext,
  OutputCleanupDeclarations,
  OutputDeclarationScope,
  OutputFileDeclaration,
  OutputWriteContext
} from './adaptor-core'
import {getNativeBinding} from '@/core/native-binding'
import {AbstractOutputAdaptor} from './adaptor-core'

interface NativeBaseOutputBinding {
  readonly collectBaseOutputPlans?: (contextJson: string) => string | Promise<string>
}

interface NativeBaseOutputFilePlan {
  readonly path: string
  readonly scope?: OutputDeclarationScope
  readonly content: string
}

interface NativeBaseOutputPluginPlan {
  readonly pluginName: string
  readonly outputFiles: readonly NativeBaseOutputFilePlan[]
  readonly cleanup: OutputCleanupDeclarations
}

interface NativeBaseOutputPlans {
  readonly plugins: readonly NativeBaseOutputPluginPlan[]
}

type NativeBasePlanMap = ReadonlyMap<string, NativeBaseOutputPluginPlan>

const baseOutputPlanCache = new WeakMap<object, Promise<NativeBasePlanMap>>()

function requireNativeBaseOutputBinding(): Required<NativeBaseOutputBinding> {
  const binding = getNativeBinding<NativeBaseOutputBinding>()
  if (binding?.collectBaseOutputPlans == null) {
    throw new TypeError('Native base-output planner binding is required. Rebuild the Rust NAPI package before running tnmsc.')
  }
  return binding as Required<NativeBaseOutputBinding>
}

async function loadNativeBasePlanMap(
  ctx: Pick<OutputWriteContext | OutputCleanContext, 'collectedOutputContext'>
): Promise<NativeBasePlanMap> {
  const binding = requireNativeBaseOutputBinding()
  const raw = await binding.collectBaseOutputPlans(
    JSON.stringify(ctx.collectedOutputContext)
  )
  const parsed = JSON.parse(raw) as NativeBaseOutputPlans
  const plans = new Map<string, NativeBaseOutputPluginPlan>()

  for (const plugin of parsed.plugins ?? []) {
    plans.set(plugin.pluginName, plugin)
  }

  return plans
}

async function getNativeBasePlan(
  pluginName: string,
  ctx: Pick<OutputWriteContext | OutputCleanContext, 'collectedOutputContext'>
): Promise<NativeBaseOutputPluginPlan> {
  const cacheKey = ctx.collectedOutputContext as object
  let plansPromise = baseOutputPlanCache.get(cacheKey)
  if (plansPromise == null) {
    plansPromise = loadNativeBasePlanMap(ctx)
    baseOutputPlanCache.set(cacheKey, plansPromise)
  }

  const plans = await plansPromise
  const plan = plans.get(pluginName)
  if (plan == null) {
    throw new Error(`Native base-output planner did not return a plan for ${pluginName}`)
  }
  return plan
}

class NativeBaseOutputAdaptor extends AbstractOutputAdaptor {
  override async declareOutputFiles(
    ctx: OutputWriteContext
  ): Promise<OutputFileDeclaration[]> {
    const plan = await getNativeBasePlan(this.name, ctx)
    return plan.outputFiles.map(outputFile => ({
      path: outputFile.path,
      source: {content: outputFile.content},
      ...outputFile.scope == null ? {} : {scope: outputFile.scope}
    }))
  }

  override async declareCleanupPaths(
    ctx: OutputCleanContext
  ): Promise<OutputCleanupDeclarations> {
    const plan = await getNativeBasePlan(this.name, ctx)
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

export class NativeAgentsOutputAdaptor extends NativeBaseOutputAdaptor {
  constructor() {
    super('AgentsOutputAdaptor', {
      outputFileName: 'AGENTS.md',
      treatWorkspaceRootProjectAsProject: true,
      capabilities: {
        prompt: {
          scopes: ['project'],
          singleScope: false
        }
      }
    })
  }
}

export class NativeGitExcludeOutputAdaptor extends NativeBaseOutputAdaptor {
  constructor() {
    super('GitExcludeOutputAdaptor', {capabilities: {}})
  }
}

export class NativeJetBrainsIDECodeStyleConfigOutputAdaptor extends NativeBaseOutputAdaptor {
  constructor() {
    super('JetBrainsIDECodeStyleConfigOutputAdaptor', {capabilities: {}})
  }
}

export class NativeVisualStudioCodeIDEConfigOutputAdaptor extends NativeBaseOutputAdaptor {
  constructor() {
    super('VisualStudioCodeIDEConfigOutputAdaptor', {capabilities: {}})
  }
}

export class NativeZedIDEConfigOutputAdaptor extends NativeBaseOutputAdaptor {
  constructor() {
    super('ZedIDEConfigOutputAdaptor', {capabilities: {}})
  }
}

export class NativeReadmeMdConfigFileOutputAdaptor extends NativeBaseOutputAdaptor {
  constructor() {
    super('ReadmeMdConfigFileOutputAdaptor', {
      outputFileName: 'README.md',
      capabilities: {}
    })
  }
}
