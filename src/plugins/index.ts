/**
 * Plugin abstract classes and utilities.
 * Provides base classes for creating input and output plugins.
 */

export { AbstractInputPlugin } from './AbstractInputPlugin'
export type {
  CleanStaleDistOptions,
  CleanStaleDistResult,
  ExecuteCommandOptions,
  ExecuteCommandResult,
  InputEffectContext,
  InputEffectHandler,
  InputEffectRegistration,
  InputEffectResult,
  ResolvedBasePaths,
  SyncDirectoryOptions,
  SyncDirectoryResult,
} from './AbstractInputPlugin'
export {
  cleanStaleDistFiles,
  executeCommand,
  syncDirectory,
} from './AbstractInputPlugin'
export { AbstractOutputPlugin } from './AbstractOutputPlugin'
export type { AbstractOutputPluginOptions, FastCommandNameTransformOptions } from './AbstractOutputPlugin'
// Abstract base classes
export { AbstractPlugin } from './AbstractPlugin'
// Effect Input Plugins
export { MarkdownWhitespaceCleanupEffectInputPlugin } from './MarkdownWhitespaceCleanupEffectInputPlugin'

export type { WhitespaceCleanupEffectResult } from './MarkdownWhitespaceCleanupEffectInputPlugin'
export { OrphanFileCleanupEffectInputPlugin } from './OrphanFileCleanupEffectInputPlugin'
export type { OrphanCleanupEffectResult } from './OrphanFileCleanupEffectInputPlugin'
// Registry writers
export { RegistryWriter } from './registry'
export { SkillNonSrcFileSyncEffectInputPlugin } from './SkillNonSrcFileSyncEffectInputPlugin'
export type { SkillSyncEffectResult } from './SkillNonSrcFileSyncEffectInputPlugin'
