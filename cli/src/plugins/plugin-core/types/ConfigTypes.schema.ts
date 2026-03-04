import {z} from 'zod/v3'

/**
 * Zod schema for a source/dist path pair.
 * Both paths are relative to the aindex project root.
 */
export const ZAindexDirPair = z.object({src: z.string(), dist: z.string()})

/**
 * Zod schema for the aindex configuration.
 * All paths are relative to <workspaceDir>/<aindex.dir>.
 */
export const ZAindexConfig = z.object({
  dir: z.string().default('aindex'),
  skills: ZAindexDirPair,
  commands: ZAindexDirPair,
  subAgents: ZAindexDirPair,
  rules: ZAindexDirPair,
  globalPrompt: ZAindexDirPair,
  workspacePrompt: ZAindexDirPair,
  app: ZAindexDirPair,
  ext: ZAindexDirPair,
  arch: ZAindexDirPair
})

/**
 * Zod schema for per-plugin command series override options.
 */
export const ZCommandSeriesPluginOverride = z.object({
  includeSeriesPrefix: z.boolean().optional(),
  seriesSeparator: z.string().optional()
})

/**
 * Zod schema for command series configuration options.
 */
export const ZCommandSeriesOptions = z.object({
  includeSeriesPrefix: z.boolean().optional(),
  pluginOverrides: z.record(z.string(), ZCommandSeriesPluginOverride).optional()
})

/**
 * Zod schema for user profile information.
 */
export const ZUserProfile = z.object({
  name: z.string().optional(),
  username: z.string().optional(),
  gender: z.string().optional(),
  birthday: z.string().optional()
}).catchall(z.unknown())

/**
 * Zod schema for the user configuration file (.tnmsc.json).
 */
export const ZUserConfigFile = z.object({
  version: z.string().optional(),
  workspaceDir: z.string().optional(),
  aindex: ZAindexConfig.optional(),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error']).optional(),
  commandSeriesOptions: ZCommandSeriesOptions.optional(),
  profile: ZUserProfile.optional()
})

/**
 * Zod schema for MCP project config.
 */
export const ZMcpProjectConfig = z.object({names: z.array(z.string()).optional()})

/**
 * Zod schema for per-type series filtering configuration.
 */
export const ZTypeSeriesConfig = z.object({
  includeSeries: z.array(z.string()).optional(),
  subSeries: z.record(z.string(), z.array(z.string())).optional()
})

/**
 * Zod schema for project config.
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
 * Zod schema for ConfigLoader options.
 */
export const ZConfigLoaderOptions = z.object({
  configFileName: z.string().optional(),
  searchPaths: z.array(z.string()).optional(),
  searchCwd: z.boolean().optional(),
  searchGlobal: z.boolean().optional()
})

export type AindexDirPair = z.infer<typeof ZAindexDirPair>
export type AindexConfig = z.infer<typeof ZAindexConfig>
export type CommandSeriesPluginOverride = z.infer<typeof ZCommandSeriesPluginOverride>
export type CommandSeriesOptions = z.infer<typeof ZCommandSeriesOptions>
export type UserConfigFile = z.infer<typeof ZUserConfigFile>
export type McpProjectConfig = z.infer<typeof ZMcpProjectConfig>
export type TypeSeriesConfig = z.infer<typeof ZTypeSeriesConfig>
export type ProjectConfig = z.infer<typeof ZProjectConfig>
export type ConfigLoaderOptions = z.infer<typeof ZConfigLoaderOptions>

/**
 * Result of loading a config file.
 */
export interface ConfigLoadResult {
  readonly config: UserConfigFile
  readonly source: string | null
  readonly found: boolean
}
