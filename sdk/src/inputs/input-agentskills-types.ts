/**
 * Types for SkillInputCapability resource processing
 */

import type {SkillChildDoc, SkillResource} from '../plugins/plugin-core'

export interface ResourceScanResult {
  readonly childDocs: SkillChildDoc[]
  readonly resources: SkillResource[]
}
