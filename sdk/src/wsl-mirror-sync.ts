import type {OutputAdaptor, OutputFileDeclaration, OutputWriteContext, WslMirrorFileDeclaration} from './adaptors/adaptor-core'
import type {WslMirrorRuntimeDependencies} from './wsl-mirror-sync-legacy'
import {isOutputAdaptorEnabled} from './adaptors/adaptor-core'
import {getNativeBinding} from './core/native-binding'

import * as wslMirrorSyncLegacy from './wsl-mirror-sync-legacy'

export interface WslMirrorSyncResult {
  readonly mirroredFiles: number
  readonly warnings: readonly string[]
  readonly errors: readonly string[]
}

export async function collectDeclaredWslMirrorFiles(
  outputAdaptors: readonly OutputAdaptor[],
  ctx: OutputWriteContext
): Promise<readonly WslMirrorFileDeclaration[]> {
  const declarations = await Promise.all(
    outputAdaptors.map(async plugin => {
      if (!isOutputAdaptorEnabled(plugin, ctx.pluginOptions)) return []
      if (plugin.declareWslMirrorFiles == null) return []
      return plugin.declareWslMirrorFiles(ctx)
    })
  )

  const dedupedDeclarations = new Map<string, WslMirrorFileDeclaration>()
  for (const group of declarations) {
    for (const declaration of group) {
      dedupedDeclarations.set(declaration.sourcePath, declaration)
    }
  }

  return [...dedupedDeclarations.values()]
}

export async function syncWindowsConfigIntoWsl(
  outputAdaptors: readonly OutputAdaptor[],
  ctx: OutputWriteContext,
  dependencies?: WslMirrorRuntimeDependencies,
  predeclaredOutputs?: ReadonlyMap<OutputAdaptor, readonly OutputFileDeclaration[]>
): Promise<WslMirrorSyncResult> {
  if (dependencies != null || predeclaredOutputs != null) {
    return wslMirrorSyncLegacy.syncWindowsConfigIntoWsl(outputAdaptors, ctx, dependencies, predeclaredOutputs)
  }

  const native = getNativeBinding<{
    syncWindowsConfigIntoWsl?: (contextJson: string, declarationsJson: string, dryRun: boolean) => Promise<string>
  }>()

  if (native?.syncWindowsConfigIntoWsl != null) {
    const declarations = await collectDeclaredWslMirrorFiles(outputAdaptors, ctx)
    const result = await native.syncWindowsConfigIntoWsl(JSON.stringify(ctx.collectedOutputContext), JSON.stringify(declarations), ctx.dryRun === true)
    return JSON.parse(result) as WslMirrorSyncResult
  }

  throw new Error('Native syncWindowsConfigIntoWsl binding is unavailable')
}
