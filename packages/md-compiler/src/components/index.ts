import {registerComponent} from '@/compiler/component-registry' // Entry point for built-in MDX components // src/components/index.ts
import {MdHandler, MdLineHandler} from './Md'

export {
  MdHandler,
  MdLineHandler
} from './Md' // Export all built-in component handlers

/**
 * Register all built-in components with the component registry.
 * Call this function during compiler initialization to make
 * all built-in components available for MDX processing.
 */
export function registerBuiltInComponents(): void {
  registerComponent('Md', MdHandler)
  registerComponent('Md.Line', MdLineHandler)
}

export {
  registerComponent
} from '@/compiler/component-registry' // Re-export component registration helper for convenience
