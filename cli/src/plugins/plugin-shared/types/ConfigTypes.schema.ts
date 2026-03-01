import {z} from 'zod/v3'

/**
 * Zod schema for a source/dist path pair.
 * Both paths are relative to the shadow source project root.
 */
export const ZShadowSourceProjectDirPair = z.object({
  /** Source path (human-authored .cn.mdx files) */
  src: z.string(),
  /** Output/compiled path (read by input plugins) */
  dist: z.string()
})

/**
 * Zod schema for the shadow source project configuration.
 * All paths are relative to `<workspaceDir>/<name>`.
 */
export const ZShadowSourceProjectConfig = z.object({
  name: z.string(),
  skill: ZShadowSourceProjectDirPair,
  fastCommand: ZShadowSourceProjectDirPair,
  subAgent: ZShadowSourceProjectDirPair,
  rule: ZShadowSourceProjectDirPair,
  globalMemory: ZShadowSourceProjectDirPair,
  workspaceMemory: ZShadowSourceProjectDirPair,
  project: ZShadowSourceProjectDirPair
})

/**
 * Zod schema for the aindex configuration (new format).
 * This is the user-facing configuration format in ~/.aindex/.tnmsc.json
 * All paths are relative to `<workspaceDir>/<name>`.
 */
export const ZAindexConfig = z.object({
  /** Name of the aindex configuration */
  name: z.string(),
  /** Skills module paths */
  skills: ZShadowSourceProjectDirPair,
  /** Commands module paths (maps to fastCommand) */
  commands: ZShadowSourceProjectDirPair,
  /** Sub-agents module paths (maps to subAgent) */
  subAgents: ZShadowSourceProjectDirPair,
  /** Rules module paths (maps to rule) */
  rules: ZShadowSourceProjectDirPair,
  /** Global prompt file paths (maps to globalMemory) */
  globalPrompt: ZShadowSourceProjectDirPair,
  /** Workspace prompt file paths (maps to workspaceMemory) */
  workspacePrompt: ZShadowSourceProjectDirPair,
  /** Application module paths (maps to project) */
  app: ZShadowSourceProjectDirPair,
  /** Extension module paths (currently ignored by plugins) */
  ext: ZShadowSourceProjectDirPair.optional(),
  /** Architecture module paths (currently ignored by plugins) */
  arch: ZShadowSourceProjectDirPair.optional()
})

/**
 * Convert aindex config format to shadowSourceProject format.
 * This provides compatibility between user-facing config and plugin system.
 */
function convertAindexToShadowSourceProject(
  aindex: z.infer<typeof ZAindexConfig>
): z.infer<typeof ZShadowSourceProjectConfig> {
  return {
    name: aindex.name,
    skill: aindex.skills,
    fastCommand: aindex.commands,
    subAgent: aindex.subAgents,
    rule: aindex.rules,
    globalMemory: aindex.globalPrompt,
    workspaceMemory: aindex.workspacePrompt,
    project: aindex.app
  }
}

/**
 * Zod schema for per-plugin fast command series override options
 */
export const ZFastCommandSeriesPluginOverride = z.object({
  includeSeriesPrefix: z.boolean().optional(),
  seriesSeparator: z.string().optional()
})

/**
 * Zod schema for fast command series configuration options
 */
export const ZFastCommandSeriesOptions = z.object({
  includeSeriesPrefix: z.boolean().optional(),
  pluginOverrides: z.record(z.string(), ZFastCommandSeriesPluginOverride).optional()
})

/**
 * Zod schema for user profile information
 */
export const ZUserProfile = z.object({
  name: z.string().optional(),
  username: z.string().optional(),
  gender: z.string().optional(),
  birthday: z.string().optional()
}).catchall(z.unknown())

/**
 * Zod schema for the user configuration file (.tnmsc.json).
 * Supports both new 'aindex' format and legacy 'shadowSourceProject' format.
 * Note: The conversion from aindex to shadowSourceProject is done in ConfigLoader, not here,
 * to avoid circular type dependencies.
 */
export const ZUserConfigFile = z.object({
  version: z.string().optional(),
  workspaceDir: z.string().optional(),
  /** New format: aindex configuration */
  aindex: ZAindexConfig.optional(),
  /** Legacy format: shadow source project configuration */
  shadowSourceProject: ZShadowSourceProjectConfig.optional(),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error']).optional(),
  fastCommandSeriesOptions: ZFastCommandSeriesOptions.optional(),
  profile: ZUserProfile.optional()
})

/**
 * Convert UserConfigFile with aindex format to include shadowSourceProject.
 * This function should be called after ZUserConfigFile.parse() to ensure valid input.
 */
export function convertUserConfigAindexToShadowSourceProject(
  config: z.infer<typeof ZUserConfigFile>
): z.infer<typeof ZUserConfigFile> {
  if (config.shadowSourceProject != null) { // If shadowSourceProject is explicitly provided, use it directly
    return config
  }

  if (config.aindex != null) { // If aindex is provided, convert it to shadowSourceProject
    return {
      ...config,
      shadowSourceProject: convertAindexToShadowSourceProject(config.aindex)
    }
  }

  return config // Neither format provided - return as-is
}

/**
 * Zod schema for MCP project config
 */
export const ZMcpProjectConfig = z.object({names: z.array(z.string()).optional()})

/**
 * Zod schema for per-type series filtering configuration.
 * Shared by all four prompt type sections (rules, skills, subAgents, commands).
 */
export const ZTypeSeriesConfig = z.object({
  includeSeries: z.array(z.string()).optional(),
  subSeries: z.record(z.string(), z.array(z.string())).optional()
})

/**
 * Zod schema for project config
 */
export const ZProjectConfig = z.object({
  mcp: ZMcpProjectConfig.optional(),
  includeSeries: z.array(z.string()).optional(),
  subSeries: z.record(z.string(), z.array(z.string())).optional(),
  rules: ZTypeSeriesConfig.optional(),
  skills: ZTypeSeriesConfig.optional(),
  subAgents: ZTypeSeriesConfig.optional(),
  commands: ZTypeSeriesConfig.optional()
})

/**
 * Zod schema for ConfigLoader options
 */
export const ZConfigLoaderOptions = z.object({
  configFileName: z.string().optional(),
  searchPaths: z.array(z.string()).optional(),
  searchCwd: z.boolean().optional(),
  searchGlobal: z.boolean().optional()
})

export type ShadowSourceProjectDirPair = z.infer<typeof ZShadowSourceProjectDirPair>
export type ShadowSourceProjectConfig = z.infer<typeof ZShadowSourceProjectConfig>
export type AindexConfig = z.infer<typeof ZAindexConfig>
export type FastCommandSeriesPluginOverride = z.infer<typeof ZFastCommandSeriesPluginOverride>
export type FastCommandSeriesOptions = z.infer<typeof ZFastCommandSeriesOptions>
export type UserConfigFile = z.infer<typeof ZUserConfigFile>
export type McpProjectConfig = z.infer<typeof ZMcpProjectConfig>
export type TypeSeriesConfig = z.infer<typeof ZTypeSeriesConfig>
export type ProjectConfig = z.infer<typeof ZProjectConfig>
export type ConfigLoaderOptions = z.infer<typeof ZConfigLoaderOptions>

/**
 * Result of loading a config file
 */
export interface ConfigLoadResult {
  readonly config: UserConfigFile
  readonly source: string | null
  readonly found: boolean
}
