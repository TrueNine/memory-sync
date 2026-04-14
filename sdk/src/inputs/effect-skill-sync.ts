import type {InputCapabilityContext, InputCollectedContext, InputEffectContext, InputEffectResult} from '../adaptors/adaptor-core'
import {AbstractInputCapability} from '../adaptors/adaptor-core'
import {getNativeBinding} from '../core/native-binding'

export interface SkillDistCleanupEffectResult extends InputEffectResult {
  readonly deletedFiles: string[]
  readonly deletedDirs: string[]
}

export class SkillDistCleanupEffectInputCapability extends AbstractInputCapability {
  constructor() {
    super('SkillDistCleanupEffectInputCapability')
    this.registerEffect('skill-dist-cleanup', this.cleanupDistSkillArtifacts.bind(this), 10)
  }

  private async cleanupDistSkillArtifacts(ctx: InputEffectContext): Promise<SkillDistCleanupEffectResult> {
    const {userConfigOptions, aindexDir, dryRun} = ctx
    const distSkillsDir = this.resolveAindexPath(userConfigOptions.aindex.skills.dist, aindexDir)

    const binding = getNativeBinding<{performSkillDistCleanup?: (distSkillsDir: string, dryRun: boolean) => string}>()
    if (binding?.performSkillDistCleanup == null) {
      throw new Error('Native performSkillDistCleanup binding is unavailable')
    }

    const resultJson = await Promise.resolve(binding.performSkillDistCleanup(distSkillsDir, dryRun))
    return JSON.parse(resultJson) as SkillDistCleanupEffectResult
  }

  collect(ctx: InputCapabilityContext): Partial<InputCollectedContext> {
    void ctx
    return {}
  }
}

export type SkillSyncEffectResult = SkillDistCleanupEffectResult

export class SkillNonSrcFileSyncEffectInputCapability extends SkillDistCleanupEffectInputCapability {}
