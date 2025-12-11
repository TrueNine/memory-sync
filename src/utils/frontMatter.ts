/**
 * Front matter generation utilities for rule files
 * Re-exports from core/capabilities and core/types for backward compatibility
 */

export {
  addFrontMatter,
  generateFrontMatter,
  removeBom,
} from '../core/capabilities'

export type { FrontMatterOptions } from '../core/types'
export { FrontMatterType } from '../core/types'
