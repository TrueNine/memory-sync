import type {MdxGlobalScope} from '@truenine/md-compiler/globals'
import type {
  InputCapability,
  InputCapabilityContext,
  InputCollectedContext,
  PluginOptions,
  UserConfigFile
} from '@/plugins/plugin-core'

import * as fs from 'node:fs'
import * as path from 'node:path'
import glob from 'fast-glob'
import {
  AIAgentIgnoreInputCapability,
  AindexInputCapability,
  CommandInputCapability,
  EditorConfigInputCapability,
  GitExcludeInputCapability,
  GitIgnoreInputCapability,
  GlobalMemoryInputCapability,
  JetBrainsConfigInputCapability,
  MarkdownWhitespaceCleanupEffectInputCapability,
  OrphanFileCleanupEffectInputCapability,
  ProjectPromptInputCapability,
  ReadmeMdInputCapability,
  RuleInputCapability,
  SkillDistCleanupEffectInputCapability,
  SkillInputCapability,
  SubAgentInputCapability,
  VSCodeConfigInputCapability,
  WorkspaceInputCapability
} from '@/inputs'
import {extractUserArgs, parseArgs} from '@/pipeline/CliArgumentParser'
import {buildDependencyContext, mergeContexts} from '@/pipeline/ContextMerger'
import {topologicalSort} from '@/pipeline/DependencyResolver'
import {createLogger, GlobalScopeCollector, ScopePriority, ScopeRegistry} from '@/plugins/plugin-core'

export interface InputRuntimeOptions {
  readonly pipelineArgs?: readonly string[]
  readonly userConfigOptions: Required<PluginOptions>
  readonly userConfig?: UserConfigFile
  readonly capabilities?: readonly InputCapability[]
  readonly includeBuiltinEffects?: boolean
}

function createBuiltinInputEffectCapabilities(): InputCapability[] {
  return [
    new SkillDistCleanupEffectInputCapability(),
    new OrphanFileCleanupEffectInputCapability(),
    new MarkdownWhitespaceCleanupEffectInputCapability()
  ]
}

function createBuiltinInputReaderCapabilities(): InputCapability[] {
  return [
    new WorkspaceInputCapability(),
    new AindexInputCapability(),
    new VSCodeConfigInputCapability(),
    new JetBrainsConfigInputCapability(),
    new EditorConfigInputCapability(),
    new SkillInputCapability(),
    new CommandInputCapability(),
    new SubAgentInputCapability(),
    new RuleInputCapability(),
    new GlobalMemoryInputCapability(),
    new ProjectPromptInputCapability(),
    new ReadmeMdInputCapability(),
    new GitIgnoreInputCapability(),
    new GitExcludeInputCapability(),
    new AIAgentIgnoreInputCapability()
  ]
}

function resolveRuntimeCommand(
  pipelineArgs?: readonly string[]
): InputCapabilityContext['runtimeCommand'] {
  if (pipelineArgs == null || pipelineArgs.length === 0) return 'execute'

  const filteredArgs = pipelineArgs.filter((arg): arg is string => arg != null)
  const userArgs = extractUserArgs(filteredArgs)
  const args = parseArgs(userArgs)

  if (args.helpFlag || args.versionFlag || args.unknownCommand != null) return void 0
  if (args.subcommand === 'clean') return 'clean'
  if (args.subcommand === 'plugins') return 'plugins'
  if (args.subcommand === 'dry-run' || args.dryRun) return 'dry-run'
  if (args.subcommand == null) return 'execute'
  return void 0
}

export async function collectInputContext(
  options: InputRuntimeOptions
): Promise<Partial<InputCollectedContext>> {
  const {
    pipelineArgs,
    userConfigOptions,
    userConfig,
    capabilities,
    includeBuiltinEffects = true
  } = options
  const logger = createLogger('InputRuntime', userConfigOptions.logLevel)
  const runtimeCommand = resolveRuntimeCommand(pipelineArgs)
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
  const globalScopeCollector = new GlobalScopeCollector({userConfig})
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
