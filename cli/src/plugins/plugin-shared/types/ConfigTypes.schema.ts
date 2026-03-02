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
  command: ZShadowSourceProjectDirPair,
  subAgent: ZShadowSourceProjectDirPair,
  rule: ZShadowSourceProjectDirPair,
  globalMemory: ZShadowSourceProjectDirPair,
  workspaceMemory: ZShadowSourceProjectDirPair,
  project: ZShadowSourceProjectDirPair
})

/**
 * Zod schema for the aindex configuration.
 * This is the user-facing configuration format in ~/.aindex/.tnmsc.json
 * All paths are relative to `<workspaceDir>/<name>`.
 */
export const ZAindexConfig = z.object({
  name: z.string(),
  skill: ZShadowSourceProjectDirPair,
  command: ZShadowSourceProjectDirPair,
  subAgent: ZShadowSourceProjectDirPair,
  rule: ZShadowSourceProjectDirPair,
  globalMemory: ZShadowSourceProjectDirPair,
  workspaceMemory: ZShadowSourceProjectDirPair,
  project: ZShadowSourceProjectDirPair
})

/**
 * Zod schema for per-plugin command series override options
 */
export const ZCommandSeriesPluginOverride = z.object({
  includeSeriesPrefix: z.boolean().optional(),
  seriesSeparator: z.string().optional()
})

/**
 * Zod schema for command series configuration options
 */
export const ZCommandSeriesOptions = z.object({
  includeSeriesPrefix: z.boolean().optional(),
  pluginOverrides: z.record(z.string(), ZCommandSeriesPluginOverride).optional()
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
 * Supports both 'aindex' format and legacy 'shadowSourceProject' format.
 * Note: Both formats have the same structure, shadowSourceProject is kept for backward compatibility.
 */
export const ZUserConfigFile = z.object({
  version: z.string().optional(),
  workspaceDir: z.string().optional(),
  /** Aindex configuration */
  aindex: ZAindexConfig.optional(),
  /** @deprecated Use aindex instead. Kept for backward compatibility. */
  shadowSourceProject: ZShadowSourceProjectConfig.optional(),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error']).optional(),
  commandSeriesOptions: ZCommandSeriesOptions.optional(),
  profile: ZUserProfile.optional()
})

/**
 * Convert UserConfigFile to ensure aindex field is populated.
 * If shadowSourceProject is provided but aindex is not, copies shadowSourceProject to aindex.
 * @deprecated This function is kept for backward compatibility.
 */
export function convertUserConfigAindexToShadowSourceProject(
  config: z.infer<typeof ZUserConfigFile>
): z.infer<typeof ZUserConfigFile> {
  // If aindex is explicitly provided, use it directly
  if (config.aindex != null) {
    return config
  }

  // If shadowSourceProject is provided but aindex is not, copy it to aindex
  if (config.shadowSourceProject != null) {
    return {
      ...config,
      aindex: config.shadowSourceProject
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

export type AindexDirPair = z.infer<typeof ZShadowSourceProjectDirPair>
export type AindexConfig = z.infer<typeof ZShadowSourceProjectConfig>

/** @deprecated Use AindexDirPair instead */
export type ShadowSourceProjectDirPair = AindexDirPair
/** @deprecated Use AindexConfig instead */
export type ShadowSourceProjectConfig = AindexConfig
export type CommandSeriesPluginOverride = z.infer<typeof ZCommandSeriesPluginOverride>
export type CommandSeriesOptions = z.infer<typeof ZCommandSeriesOptions>
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
