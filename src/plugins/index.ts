/**
 * Plugin abstract classes and utilities.
 * Provides base classes for creating input and output plugins.
 */

export {
  AbstractInputPlugin,
} from './AbstractInputPlugin'
export type {
  CleanStaleDistOptions,
  CleanStaleDistResult,
  ExecuteCommandOptions,
  ExecuteCommandResult,
  InputEffectContext,
  InputEffectHandler,
  InputEffectRegistration,
  InputEffectResult,
  PluginScopeRegistration,
  ResolvedBasePaths,
  SyncDirectoryOptions,
  SyncDirectoryResult,
} from './AbstractInputPlugin'
export {
  cleanStaleDistFiles,
  executeCommand,
  syncDirectory,
} from './AbstractInputPlugin'
export {
  AbstractOutputPlugin,
} from './AbstractOutputPlugin'
export type {
  AbstractOutputPluginOptions,
  FastCommandNameTransformOptions,
} from './AbstractOutputPlugin'
export {
  AbstractPlugin,
} from './AbstractPlugin' // Abstract base classes
export {
  GenericSkillsOutputPlugin,
} from './GenericSkillsOutputPlugin'
export {
  GitExcludeInputPlugin,
} from './GitExcludeInputPlugin' // Git plugins
export {
  GitExcludeOutputPlugin,
} from './GitExcludeOutputPlugin'
export {
  GitIgnoreInputPlugin,
} from './GitIgnoreInputPlugin'
export {
  MarkdownWhitespaceCleanupEffectInputPlugin,
} from './MarkdownWhitespaceCleanupEffectInputPlugin' // Effect Input Plugins

export type {
  WhitespaceCleanupEffectResult,
} from './MarkdownWhitespaceCleanupEffectInputPlugin'
export {
  OrphanFileCleanupEffectInputPlugin,
} from './OrphanFileCleanupEffectInputPlugin'
export type {
  OrphanCleanupEffectResult,
} from './OrphanFileCleanupEffectInputPlugin'
export {
  RegistryWriter,
} from './registry' // Registry writers
export {
  SkillNonSrcFileSyncEffectInputPlugin,
} from './SkillNonSrcFileSyncEffectInputPlugin'
export type {
  SkillSyncEffectResult,
} from './SkillNonSrcFileSyncEffectInputPlugin'
