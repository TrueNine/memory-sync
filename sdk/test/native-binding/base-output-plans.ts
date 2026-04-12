import type {
  ILogger,
  OutputCleanContext,
  OutputCleanupDeclarations,
  OutputCollectedContext,
  OutputFileDeclaration,
  OutputWriteContext
} from '../../src/adaptors/adaptor-core'
import {Buffer} from 'node:buffer'
import * as fs from 'node:fs'
import * as path from 'node:path'
import glob from 'fast-glob'
import {createLogger} from '../../src/adaptors/adaptor-core'
import {AgentsOutputAdaptor} from '../../src/adaptors/AgentsOutputAdaptor'
import {DroidCLIOutputAdaptor} from '../../src/adaptors/DroidCLIOutputAdaptor'
import {GeminiCLIOutputAdaptor} from '../../src/adaptors/GeminiCLIOutputAdaptor'
import {GitExcludeOutputAdaptor} from '../../src/adaptors/GitExcludeOutputAdaptor'
import {JetBrainsIDECodeStyleConfigOutputAdaptor} from '../../src/adaptors/JetBrainsIDECodeStyleConfigOutputAdaptor'
import {ReadmeMdConfigFileOutputAdaptor} from '../../src/adaptors/ReadmeMdConfigFileOutputAdaptor'
import {VisualStudioCodeIDEConfigOutputAdaptor} from '../../src/adaptors/VisualStudioCodeIDEConfigOutputAdaptor'
import {ZedIDEConfigOutputAdaptor} from '../../src/adaptors/ZedIDEConfigOutputAdaptor'
import {parseNativeInputResult} from '../../src/inputs/native-result'

interface NativeBaseOutputFilePlan {
  readonly path: string
  readonly scope?: string
  readonly content: string
  readonly encoding?: 'text' | 'base64'
}

interface NativeBaseOutputPluginPlan {
  readonly pluginName: string
  readonly outputFiles: readonly NativeBaseOutputFilePlan[]
  readonly cleanup: OutputCleanupDeclarations
}

interface NativeBaseOutputPlans {
  readonly plugins: readonly NativeBaseOutputPluginPlan[]
}

function createMockLogger(): ILogger {
  return createLogger('test-native-base-output-plans', 'silent')
}

function createWriteContext(
  collectedOutputContext: OutputCollectedContext
): OutputWriteContext {
  return {
    logger: createMockLogger(),
    fs,
    path,
    glob,
    dryRun: true,
    runtimeTargets: {jetbrainsCodexDirs: []},
    collectedOutputContext
  } as unknown as OutputWriteContext
}

function createCleanContext(
  collectedOutputContext: OutputCollectedContext
): OutputCleanContext {
  return {
    logger: createMockLogger(),
    fs,
    path,
    glob,
    dryRun: true,
    runtimeTargets: {jetbrainsCodexDirs: []},
    collectedOutputContext
  } as unknown as OutputCleanContext
}

async function declarationContentToPlan(
  declaration: OutputFileDeclaration,
  content: string | Uint8Array
): Promise<NativeBaseOutputFilePlan> {
  if (typeof content === 'string') {
    return {
      path: declaration.path,
      scope: declaration.scope,
      content
    }
  }

  return {
    path: declaration.path,
    scope: declaration.scope,
    content: Buffer.from(content).toString('base64'),
    encoding: 'base64'
  }
}

export async function collectBaseOutputPlans(
  contextJson: string
): Promise<string> {
  const collectedOutputContext = parseNativeInputResult<OutputCollectedContext>(
    contextJson
  )
  const writeContext = createWriteContext(collectedOutputContext)
  const cleanContext = createCleanContext(collectedOutputContext)
  const plugins = [
    new AgentsOutputAdaptor(),
    new GitExcludeOutputAdaptor(),
    new JetBrainsIDECodeStyleConfigOutputAdaptor(),
    new VisualStudioCodeIDEConfigOutputAdaptor(),
    new ZedIDEConfigOutputAdaptor(),
    new ReadmeMdConfigFileOutputAdaptor()
  ]
  const pluginPlans: NativeBaseOutputPluginPlan[] = []

  for (const plugin of plugins) {
    const declarations = await plugin.declareOutputFiles(writeContext)
    const outputFiles: NativeBaseOutputFilePlan[] = []

    for (const declaration of declarations) {
      const content = await plugin.convertContent(declaration, writeContext)
      outputFiles.push(await declarationContentToPlan(declaration, content))
    }

    const cleanup = plugin.declareCleanupPaths == null
      ? {}
      : await plugin.declareCleanupPaths(cleanContext)

    pluginPlans.push({
      pluginName: plugin.name,
      outputFiles,
      cleanup
    })
  }

  const result: NativeBaseOutputPlans = {
    plugins: pluginPlans
  }
  return JSON.stringify(result)
}

export async function collectGeminiOutputPlan(
  contextJson: string
): Promise<string> {
  const collectedOutputContext = parseNativeInputResult<OutputCollectedContext>(
    contextJson
  )
  const writeContext = createWriteContext(collectedOutputContext)
  const cleanContext = createCleanContext(collectedOutputContext)
  const plugin = new GeminiCLIOutputAdaptor()
  const declarations = await plugin.declareOutputFiles(writeContext)
  const outputFiles: NativeBaseOutputFilePlan[] = []

  for (const declaration of declarations) {
    const content = await plugin.convertContent(declaration, writeContext)
    outputFiles.push(await declarationContentToPlan(declaration, content))
  }

  const cleanup = plugin.declareCleanupPaths == null
    ? {}
    : await plugin.declareCleanupPaths(cleanContext)

  return JSON.stringify({
    pluginName: plugin.name,
    outputFiles,
    cleanup
  } satisfies NativeBaseOutputPluginPlan)
}

export async function collectDroidOutputPlan(
  contextJson: string
): Promise<string> {
  const collectedOutputContext = parseNativeInputResult<OutputCollectedContext>(
    contextJson
  )
  const writeContext = createWriteContext(collectedOutputContext)
  const cleanContext = createCleanContext(collectedOutputContext)
  const plugin = new DroidCLIOutputAdaptor()
  const declarations = await plugin.declareOutputFiles(writeContext)
  const outputFiles: NativeBaseOutputFilePlan[] = []

  for (const declaration of declarations) {
    const content = await plugin.convertContent(declaration, writeContext)
    outputFiles.push(await declarationContentToPlan(declaration, content))
  }

  const cleanup = plugin.declareCleanupPaths == null
    ? {}
    : await plugin.declareCleanupPaths(cleanContext)

  return JSON.stringify({
    pluginName: plugin.name,
    outputFiles,
    cleanup
  } satisfies NativeBaseOutputPluginPlan)
}
