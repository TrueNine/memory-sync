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
  arch: ZAindexDirPair,
  softwares: ZAindexDirPair.default({src: 'softwares', dist: 'dist/softwares'})
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
 * Zod schema for output scope value.
 */
export const ZOutputScope = z.enum(['project', 'global'])

/**
 * Zod schema for selecting one or more scopes.
 */
export const ZOutputScopeSelection = z.union([ZOutputScope, z.array(ZOutputScope).min(1)])

/**
 * Zod schema for per-plugin topic scope overrides.
 */
export const ZPluginOutputScopeTopics = z.object({
  prompt: ZOutputScopeSelection.optional(),
  rules: ZOutputScopeSelection.optional(),
  commands: ZOutputScopeSelection.optional(),
  subagents: ZOutputScopeSelection.optional(),
  skills: ZOutputScopeSelection.optional(),
  mcp: ZOutputScopeSelection.optional()
})

/**
 * Zod schema for output scope override configuration.
 */
export const ZOutputScopeOptions = z.object({plugins: z.record(z.string(), ZPluginOutputScopeTopics).optional()})

/**
 * Zod schema for shared front matter formatting options.
 */
export const ZFrontMatterOptions = z.object({blankLineAfter: z.boolean().optional()})

export const ZProtectionMode = z.enum(['direct', 'recursive'])
export const ZProtectionRuleMatcher = z.enum(['path', 'glob'])

export const ZCleanupProtectionRule = z.object({
  path: z.string(),
  protectionMode: ZProtectionMode,
  matcher: ZProtectionRuleMatcher.optional(),
  reason: z.string().optional()
})

export const ZCleanupProtectionOptions = z.object({rules: z.array(ZCleanupProtectionRule).optional()})
export const ZStringOrStringArray = z.union([z.string(), z.array(z.string()).min(1)])
export const ZWindowsWsl2Options = z.object({
  instances: ZStringOrStringArray.optional()
})
export const ZWindowsOptions = z.object({
  wsl2: ZWindowsWsl2Options.optional()
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
  outputScopes: ZOutputScopeOptions.optional(),
  frontMatter: ZFrontMatterOptions.optional(),
  cleanupProtection: ZCleanupProtectionOptions.optional(),
  windows: ZWindowsOptions.optional(),
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
export const ZConfigLoaderOptions = z.object({})

export type AindexDirPair = z.infer<typeof ZAindexDirPair>
export type AindexConfig = z.infer<typeof ZAindexConfig>
export type CommandSeriesPluginOverride = z.infer<typeof ZCommandSeriesPluginOverride>
export type CommandSeriesOptions = z.infer<typeof ZCommandSeriesOptions>
export type OutputScope = z.infer<typeof ZOutputScope>
export type OutputScopeSelection = z.infer<typeof ZOutputScopeSelection>
export type PluginOutputScopeTopics = z.infer<typeof ZPluginOutputScopeTopics>
export type OutputScopeOptions = z.infer<typeof ZOutputScopeOptions>
export type FrontMatterOptions = z.infer<typeof ZFrontMatterOptions>
export type ProtectionMode = z.infer<typeof ZProtectionMode>
export type ProtectionRuleMatcher = z.infer<typeof ZProtectionRuleMatcher>
export type CleanupProtectionRule = z.infer<typeof ZCleanupProtectionRule>
export type CleanupProtectionOptions = z.infer<typeof ZCleanupProtectionOptions>
export type StringOrStringArray = z.infer<typeof ZStringOrStringArray>
export type WindowsWsl2Options = z.infer<typeof ZWindowsWsl2Options>
export type WindowsOptions = z.infer<typeof ZWindowsOptions>
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
