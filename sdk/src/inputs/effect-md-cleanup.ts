import type {InputCapabilityContext, InputCollectedContext, InputEffectContext, InputEffectResult} from '../adaptors/adaptor-core'
import {resolveAindexProjectSeriesConfigs} from '@/aindex-project-series'
import {AbstractInputCapability} from '../adaptors/adaptor-core'
import {getNativeBinding} from '../core/native-binding'

export interface WhitespaceCleanupEffectResult extends InputEffectResult {
  readonly modifiedFiles: string[]
  readonly skippedFiles: string[]
}

export class MarkdownWhitespaceCleanupEffectInputCapability extends AbstractInputCapability {
  constructor() {
    super('MarkdownWhitespaceCleanupEffectInputCapability')
    this.registerEffect('markdown-whitespace-cleanup', this.cleanupWhitespace.bind(this), 30)
  }

  private async cleanupWhitespace(ctx: InputEffectContext): Promise<WhitespaceCleanupEffectResult> {
    const {path, aindexDir, dryRun, userConfigOptions} = ctx
    const projectSeriesDirs = resolveAindexProjectSeriesConfigs(userConfigOptions)
      .map(series => path.join(aindexDir, series.src))

    const dirsToScan = [
      path.join(aindexDir, 'src'),
      ...projectSeriesDirs,
      path.join(aindexDir, 'dist')
    ].filter((dir): dir is string => typeof dir === 'string')

    const binding = getNativeBinding<{performMdCleanup?: (dirs: string[], dryRun: boolean) => string}>()
    if (binding?.performMdCleanup == null) {
      throw new Error('Native performMdCleanup binding is unavailable')
    }

    const resultJson = await Promise.resolve(binding.performMdCleanup(dirsToScan, dryRun === true))
    return JSON.parse(resultJson) as WhitespaceCleanupEffectResult
  }

  collect(ctx: InputCapabilityContext): Partial<InputCollectedContext> {
    void ctx
    return {}
  }
}
