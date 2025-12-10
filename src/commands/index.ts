/**
 * Command exports
 *
 * This module exports all CLI commands. The primary command is `autoSyncCommand`
 * which uses the plugin-based architecture.
 */

// Primary plugin-based command
export { autoSyncCommand, autoSyncWithFilter } from './auto'
export type { AutoSyncOptions } from './auto'

// Utility commands
export { docLinkCommand } from './docLink'
export { projectSelectCommand } from './projectSelect'
