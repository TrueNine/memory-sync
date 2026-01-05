// src/components/index.ts
// Entry point for built-in MDX components

import { registerComponent } from '../compiler/component-registry'
import { MdHandler, MdLineHandler } from './Md'

// Re-export component registration helper for convenience
export { registerComponent } from '../compiler/component-registry'

/**
 * Register all built-in components with the component registry.
 * Call this function during compiler initialization to make
 * all built-in components available for MDX processing.
 */
export function registerBuiltInComponents(): void {
  registerComponent('Md', MdHandler)
  registerComponent('Md.Line', MdLineHandler)
}

// Export all built-in component handlers
export { MdHandler, MdLineHandler } from './Md'
