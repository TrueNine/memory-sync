import type {AdaptorOptions, InputCapability, InputCapabilityContext, InputCollectedContext, UserConfigFile} from '@/adaptors/adaptor-core'
import type {MdxGlobalScope} from '@/md-compiler/globals'
import type {RuntimeCommand} from '@/runtime-command'

import * as fs from 'node:fs'
import * as path from 'node:path'
import glob from 'fast-glob'
import {GlobalScopeCollector, ScopePriority, ScopeRegistry} from '@/adaptors/adaptor-core/GlobalScopeCollector'
import {
  AIAgentIgnoreInputCapability,
  AindexInputCapability,
  CommandInputCapability,
  EditorConfigInputCapability,
  GitExcludeInputCapability,
  GitIgnoreInputCapability,
  JetBrainsConfigInputCapability,
  MarkdownWhitespaceCleanupEffectInputCapability,
  NativeInputCapability,
  OrphanFileCleanupEffectInputCapability,
  ProjectPromptInputCapability,
  ReadmeMdInputCapability,
  RuleInputCapability,
  SkillDistCleanupEffectInputCapability,
  SkillInputCapability,
  SubAgentInputCapability,
  VSCodeConfigInputCapability,
  ZedConfigInputCapability
} from '@/inputs'
import {createLogger} from '@/libraries/logger'
import {buildDependencyContext, mergeContexts} from '@/pipeline/ContextMerger'
import {topologicalSort} from '@/pipeline/DependencyResolver'

export interface InputRuntimeOptions {
  readonly runtimeCommand?: RuntimeCommand
  readonly userConfigOptions: Required<AdaptorOptions>
  readonly userConfig?: UserConfigFile
  readonly capabilities?: readonly InputCapability[]
  readonly includeBuiltinEffects?: boolean
}

function createBuiltinInputEffectCapabilities(): InputCapability[] {
  return [new SkillDistCleanupEffectInputCapability(), new OrphanFileCleanupEffectInputCapability(), new MarkdownWhitespaceCleanupEffectInputCapability()]
}

function createBuiltinInputReaderCapabilities(): InputCapability[] {
  return [
    new NativeInputCapability('WorkspaceInputCapability', 'collectWorkspace'),
    new AindexInputCapability(),
    new VSCodeConfigInputCapability(),
    new ZedConfigInputCapability(),
    new JetBrainsConfigInputCapability(),
    new EditorConfigInputCapability(),
    new SkillInputCapability(),
    new CommandInputCapability(),
    new SubAgentInputCapability(),
    new RuleInputCapability(),
    new NativeInputCapability('GlobalMemoryInputCapability', 'collectGlobalMemory'),
    new ProjectPromptInputCapability(),
    new ReadmeMdInputCapability(),
    new GitIgnoreInputCapability(),
    new GitExcludeInputCapability(),
    new AIAgentIgnoreInputCapability()
  ]
}

export async function collectInputContext(options: InputRuntimeOptions): Promise<Partial<InputCollectedContext>> {
  const {runtimeCommand, userConfigOptions, userConfig, capabilities, includeBuiltinEffects = true} = options
  const logger = createLogger('InputRuntime', userConfigOptions.logLevel)
  const baseCtx: Omit<InputCapabilityContext, 'dependencyContext' | 'globalScope' | 'scopeRegistry'> = {
    logger,
    userConfigOptions,
    fs,
    path,
    glob
  }

  const resolvedCapabilities = topologicalSort([
    ...includeBuiltinEffects ? createBuiltinInputEffectCapabilities() : [],
    ...capabilities ?? createBuiltinInputReaderCapabilities()
  ])
  const globalScopeCollector = new GlobalScopeCollector({userConfig, userConfigOptions})
  const globalScope: MdxGlobalScope = globalScopeCollector.collect()
  const scopeRegistry = new ScopeRegistry()
  scopeRegistry.setGlobalScope(globalScope)

  logger.debug('global scope collected', {
    osInfo: {
      platform: globalScope.os.platform,
      arch: globalScope.os.arch,
      shellKind: globalScope.os.shellKind
    },
    hasProfile: Object.keys(globalScope.profile).length > 0,
    hasCodeStyles: Object.keys(globalScope.codeStyles).length > 0,
    hasTool: Object.keys(globalScope.tool).length > 0
  })

  const outputsByCapability = new Map<string, Partial<InputCollectedContext>>()
  let accumulatedContext: Partial<InputCollectedContext> = {}

  for (const capability of resolvedCapabilities) {
    const dependencyContext = buildDependencyContext(capability, outputsByCapability, mergeContexts)
    const ctx: InputCapabilityContext = {
      ...baseCtx,
      dependencyContext,
      ...runtimeCommand != null ? {runtimeCommand} : {},
      globalScope,
      scopeRegistry
    }

    const capabilityWithEffects = capability as InputCapability & {
      executeEffects?: (ctx: InputCapabilityContext, dryRun: boolean) => Promise<unknown>
    }
    if (capabilityWithEffects.executeEffects != null) await capabilityWithEffects.executeEffects(ctx, false)

    const output = await capability.collect(ctx)
    outputsByCapability.set(capability.name, output)
    accumulatedContext = mergeContexts(accumulatedContext, output)

    const capabilityWithScopes = capability as InputCapability & {
      getRegisteredScopes?: () => readonly {namespace: string, values: Record<string, unknown>}[]
    }
    if (capabilityWithScopes.getRegisteredScopes != null) {
      const registeredScopes = capabilityWithScopes.getRegisteredScopes()
      for (const {namespace, values} of registeredScopes) {
        scopeRegistry.register(namespace, values, ScopePriority.PluginRegistered)
        logger.debug('input capability scope registered', {
          capability: capability.name,
          namespace,
          keys: Object.keys(values)
        })
      }
    }
  }

  return accumulatedContext
}
