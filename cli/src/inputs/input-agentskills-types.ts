/**
 * Types for SkillInputPlugin resource processing
 */

import type {SkillChildDoc, SkillResource} from '../plugins/plugin-shared'

export interface ResourceScanResult {
  readonly childDocs: SkillChildDoc[]
  readonly resources: SkillResource[]
}
