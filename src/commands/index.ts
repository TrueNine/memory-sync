/**
 * Command exports
 *
 * This module exports all CLI commands. The primary command is `autoSyncCommand`
 * which uses the plugin-based architecture. Legacy commands are kept for
 * backward compatibility but are marked as deprecated.
 */

// Legacy commands (deprecated - use autoSyncCommand with plugins instead)
/** @deprecated Use autoSyncCommand with plugins instead */
export { antigravityExporterCommand } from './antigravityExporter'
// Primary plugin-based command
export { autoSyncCommand, autoSyncWithFilter } from './auto'

export type { AutoSyncOptions } from './auto'
// Utility commands (not deprecated)
export { docLinkCommand } from './docLink'

/** @deprecated Use autoSyncCommand with KiroPlugin instead */
export { kiroAgentsExportCommand, kiroAgentsExportCore } from './kiroAgentsExport'
/** @deprecated Use autoSyncCommand with GlobalPromptPlugin instead */
export { kiroSteeringExportCommand, kiroSteeringExportCore } from './kiroSteeringExport'
/** @deprecated Use autoSyncCommand with ClaudePlugin instead */
export { mapAgentsClaudeCommand } from './mapAgentsClaude'
export { projectSelectCommand } from './projectSelect'
/** @deprecated Use autoSyncCommand with QoderPlugin instead */
export { qoderExportCommand } from './qoderExport'
/** @deprecated Use autoSyncCommand with SkillsPlugin instead */
export { skillsSyncCommand, skillsSyncCore } from './skillsSync'
