/**
 * Plugin abstract classes and utilities.
 * Provides base classes for creating input and output plugins.
 */

export { // Re-export AbstractInputPlugin
  AbstractInputPlugin
} from './AbstractInputPlugin'
export { // Types are now in @/types
  AbstractOutputPlugin
} from './AbstractOutputPlugin'
export type {
  AbstractOutputPluginOptions,
  FastCommandNameTransformOptions
} from './AbstractOutputPlugin'
export {
  AbstractPlugin
} from './AbstractPlugin' // Abstract base classes
export {
  AntigravityOutputPlugin
} from './AntigravityOutputPlugin'
export {
  GenericSkillsOutputPlugin
} from './GenericSkillsOutputPlugin'
export {
  GitExcludeInputPlugin
} from './GitExcludeInputPlugin' // Git plugins
export {
  GitExcludeOutputPlugin
} from './GitExcludeOutputPlugin'
export {
  GitIgnoreInputPlugin
} from './GitIgnoreInputPlugin'
export {
  MarkdownWhitespaceCleanupEffectInputPlugin
} from './MarkdownWhitespaceCleanupEffectInputPlugin' // Effect Input Plugins

export type {
  WhitespaceCleanupEffectResult
} from './MarkdownWhitespaceCleanupEffectInputPlugin'
export {
  OpencodeCLIOutputPlugin
} from './OpencodeCLIOutputPlugin'
export {
  OrphanFileCleanupEffectInputPlugin
} from './OrphanFileCleanupEffectInputPlugin'
export type {
  OrphanCleanupEffectResult
} from './OrphanFileCleanupEffectInputPlugin'
export {
  RegistryWriter
} from './registry' // Registry writers
export {
  SkillNonSrcFileSyncEffectInputPlugin
} from './SkillNonSrcFileSyncEffectInputPlugin'
export type {
  SkillSyncEffectResult
} from './SkillNonSrcFileSyncEffectInputPlugin'
