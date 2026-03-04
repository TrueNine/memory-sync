import type {ILogger, McpServerConfig, SkillPrompt} from '../types'
import * as path from 'node:path'

/**
 * MCP configuration format type
 */
export type McpConfigFormat = 'cursor' | 'opencode'

/**
 * MCP config entry for a single server
 */
export interface McpServerEntry {
  readonly name: string
  readonly config: McpServerConfig
}

/**
 * Transformed MCP server config for different output formats
 */
export interface TransformedMcpConfig {
  [serverName: string]: Record<string, unknown>
}

/**
 * Result of MCP config write operation
 */
export interface McpWriteResult {
  readonly success: boolean
  readonly path: string
  readonly serverCount: number
  readonly error?: Error
  readonly skipped?: boolean
}

/**
 * MCP configuration transformer function type
 */
export type McpConfigTransformer = (config: McpServerConfig) => Record<string, unknown>

/**
 * MCP Config Manager
 * Handles merging and writing MCP configurations from skills to various output formats
 */
export class McpConfigManager {
  private readonly fs: typeof import('node:fs')
  private readonly logger: ILogger

  constructor(deps: {fs: typeof import('node:fs'), logger: ILogger}) {
    this.fs = deps.fs
    this.logger = deps.logger
  }

  collectMcpServers(skills: readonly SkillPrompt[]): Map<string, McpServerConfig> {
    const merged = new Map<string, McpServerConfig>()

    for (const skill of skills) {
      if (skill.mcpConfig == null) continue

      for (const [name, config] of Object.entries(skill.mcpConfig.mcpServers)) {
        merged.set(name, config)
        this.logger.debug('mcp server collected', {skill: skill.yamlFrontMatter.name, mcpName: name})
      }
    }

    return merged
  }

  transformMcpServers(
    servers: Map<string, McpServerConfig>,
    transformer: McpConfigTransformer
  ): TransformedMcpConfig {
    const result: TransformedMcpConfig = {}

    for (const [name, config] of servers) result[name] = transformer(config)

    return result
  }

  readExistingConfig(configPath: string): Record<string, unknown> {
    try {
      if (this.fs.existsSync(configPath)) {
        const content = this.fs.readFileSync(configPath, 'utf8')
        return JSON.parse(content) as Record<string, unknown>
      }
    }
    catch {
      this.logger.warn('failed to read existing mcp config, starting fresh', {path: configPath})
    }
    return {}
  }

  writeCursorMcpConfig(
    configPath: string,
    servers: TransformedMcpConfig,
    dryRun: boolean
  ): McpWriteResult {
    const existingConfig = this.readExistingConfig(configPath)
    const existingMcpServers = (existingConfig['mcpServers'] as Record<string, unknown>) ?? {}

    existingConfig['mcpServers'] = {...existingMcpServers, ...servers}
    const content = JSON.stringify(existingConfig, null, 2)

    return this.writeConfigFile(configPath, content, Object.keys(servers).length, dryRun)
  }

  writeOpencodeMcpConfig(
    configPath: string,
    servers: TransformedMcpConfig,
    dryRun: boolean,
    additionalConfig?: Record<string, unknown>
  ): McpWriteResult {
    const existingConfig = this.readExistingConfig(configPath)

    const mergedConfig = { // Merge with additional config (like $schema, plugin array)
      ...existingConfig,
      ...additionalConfig,
      mcp: servers
    }

    const content = JSON.stringify(mergedConfig, null, 2)
    return this.writeConfigFile(configPath, content, Object.keys(servers).length, dryRun)
  }

  writeSkillMcpConfig(
    configPath: string,
    rawContent: string,
    dryRun: boolean
  ): McpWriteResult {
    return this.writeConfigFile(configPath, rawContent, 1, dryRun)
  }

  private ensureDirectory(dir: string): void {
    if (!this.fs.existsSync(dir)) this.fs.mkdirSync(dir, {recursive: true})
  }

  private writeConfigFile(
    configPath: string,
    content: string,
    serverCount: number,
    dryRun: boolean
  ): McpWriteResult {
    if (dryRun) {
      this.logger.trace({action: 'dryRun', type: 'mcpConfig', path: configPath, serverCount})
      return {success: true, path: configPath, serverCount, skipped: true}
    }

    try {
      this.ensureDirectory(path.dirname(configPath))
      this.fs.writeFileSync(configPath, content)
      this.logger.trace({action: 'write', type: 'mcpConfig', path: configPath, serverCount})
      return {success: true, path: configPath, serverCount}
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.logger.error({action: 'write', type: 'mcpConfig', path: configPath, error: errMsg})
      return {success: false, path: configPath, serverCount: 0, error: error as Error}
    }
  }
}

/**
 * Transform MCP config for Cursor format
 * Keeps standard MCP structure with command/args/env or url/headers
 */
export function transformMcpConfigForCursor(config: McpServerConfig): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  if (config.command != null) {
    result['command'] = config.command
    if (config.args != null) result['args'] = config.args
    if (config.env != null) result['env'] = config.env
    return result
  }

  const configRecord = config as unknown as Record<string, unknown>
  const url = configRecord['url'] ?? configRecord['serverUrl']

  if (url == null) return result

  result['url'] = url
  const {headers} = configRecord
  if (headers != null) result['headers'] = headers

  return result
}

/**
 * Transform MCP config for Opencode format
 * Converts to local (command array) or remote (url) format with enabled flag
 */
export function transformMcpConfigForOpencode(config: McpServerConfig): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  if (config.command != null) {
    result['type'] = 'local'
    const commandArray = [config.command]
    if (config.args != null) commandArray.push(...config.args)
    result['command'] = commandArray
    if (config.env != null) result['environment'] = config.env
  } else {
    result['type'] = 'remote'
    const configRecord = config as unknown as Record<string, unknown>
    if (configRecord['url'] != null) result['url'] = configRecord['url']
    else if (configRecord['serverUrl'] != null) result['url'] = configRecord['serverUrl']
  }

  result['enabled'] = config.disabled !== true

  return result
}
