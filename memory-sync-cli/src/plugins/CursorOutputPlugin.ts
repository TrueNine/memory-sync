import type {
  OutputPluginContext,
  OutputWriteContext,
  SkillPrompt,
  WriteResult,
  WriteResults
} from '@/types'
import type {RelativePath} from '@/types/FileSystemTypes'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {FilePathKind} from '@/types'
import {AbstractOutputPlugin} from './AbstractOutputPlugin'

const GLOBAL_CONFIG_DIR = '.cursor'
const MCP_CONFIG_FILE = 'mcp.json'

/**
 * Cursor IDE output plugin.
 * Depends on AgentsOutputPlugin so that AGENTS.md is generated before this plugin runs.
 * Writes merged MCP config from skills to ~/.cursor/mcp.json (Cursor global MCP config).
 */
export class CursorOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('CursorOutputPlugin', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
      outputFileName: '',
      dependsOn: ['AgentsOutputPlugin']
    })

    this.registerCleanEffect('mcp-config-cleanup', async ctx => {
      const globalDir = this.getGlobalConfigDir()
      const mcpConfigPath = path.join(globalDir, MCP_CONFIG_FILE)
      const emptyMcpConfig = {mcpServers: {}}

      if (ctx.dryRun === true) {
        this.log.trace({action: 'dryRun', type: 'mcpConfigCleanup', path: mcpConfigPath})
        return {success: true, description: 'Would reset mcp.json to empty shell'}
      }

      try {
        this.ensureDirectory(globalDir)
        fs.writeFileSync(mcpConfigPath, JSON.stringify(emptyMcpConfig, null, 2))
        this.log.trace({action: 'clean', type: 'mcpConfigCleanup', path: mcpConfigPath})
        return {success: true, description: 'Reset mcp.json to empty shell'}
      }
      catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        this.log.error({action: 'clean', type: 'mcpConfigCleanup', path: mcpConfigPath, error: errMsg})
        return {success: false, error: error as Error, description: 'Failed to reset mcp.json'}
      }
    })
  }

  async registerGlobalOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const hasAnyMcpConfig = ctx.collectedInputContext.skills?.some(s => s.mcpConfig != null) ?? false

    if (!hasAnyMcpConfig) return results

    const globalDir = this.getGlobalConfigDir()
    const mcpConfigPath = path.join(globalDir, MCP_CONFIG_FILE)
    results.push({
      pathKind: FilePathKind.Relative,
      path: MCP_CONFIG_FILE,
      basePath: globalDir,
      getDirectoryName: () => GLOBAL_CONFIG_DIR,
      getAbsolutePath: () => mcpConfigPath
    })

    return results
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {skills} = ctx.collectedInputContext
    const hasSkills = (skills?.length ?? 0) > 0

    if (hasSkills) return true

    this.log.trace({action: 'skip', reason: 'noOutputs'})
    return false
  }

  async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {skills} = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    if (skills == null || skills.length === 0) return {files: fileResults, dirs: dirResults}

    const mcpResult = await this.writeGlobalMcpConfig(ctx, skills)
    if (mcpResult != null) fileResults.push(mcpResult)

    return {files: fileResults, dirs: dirResults}
  }

  private async writeGlobalMcpConfig(
    ctx: OutputWriteContext,
    skills: readonly SkillPrompt[]
  ): Promise<WriteResult | null> {
    const mergedMcpServers: Record<string, unknown> = {}

    for (const skill of skills) {
      if (skill.mcpConfig == null) continue

      const {mcpServers} = skill.mcpConfig

      for (const [mcpName, mcpConfig] of Object.entries(mcpServers)) {
        mergedMcpServers[mcpName] = this.transformMcpConfigForCursor({...(mcpConfig as unknown as Record<string, unknown>)})
      }
    }

    if (Object.keys(mergedMcpServers).length === 0) return null

    const globalDir = this.getGlobalConfigDir()
    const mcpConfigPath = path.join(globalDir, MCP_CONFIG_FILE)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: MCP_CONFIG_FILE,
      basePath: globalDir,
      getDirectoryName: () => GLOBAL_CONFIG_DIR,
      getAbsolutePath: () => mcpConfigPath
    }

    let existingConfig: Record<string, unknown> = {}
    try {
      if (this.existsSync(mcpConfigPath)) {
        const content = fs.readFileSync(mcpConfigPath, 'utf8')
        existingConfig = JSON.parse(content) as Record<string, unknown>
      }
    }
    catch {
      existingConfig = {}
    }

    const existingMcpServers = (existingConfig['mcpServers'] as Record<string, unknown>) ?? {}
    const finalMcpServers = {...existingMcpServers, ...mergedMcpServers}
    existingConfig['mcpServers'] = finalMcpServers
    const content = JSON.stringify(existingConfig, null, 2)

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'globalMcpConfig', path: mcpConfigPath, serverCount: Object.keys(mergedMcpServers).length})
      return {path: relativePath, success: true, skipped: false}
    }

    try {
      this.ensureDirectory(globalDir)
      fs.writeFileSync(mcpConfigPath, content)
      this.log.trace({action: 'write', type: 'globalMcpConfig', path: mcpConfigPath, serverCount: Object.keys(mergedMcpServers).length})
      return {path: relativePath, success: true}
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'globalMcpConfig', path: mcpConfigPath, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
  }

  private transformMcpConfigForCursor(config: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}

    if (config['command'] != null) {
      result['command'] = config['command']
      if (config['args'] != null) result['args'] = config['args']
      if (config['env'] != null) result['env'] = config['env']
      return result
    }

    const url = config['url'] ?? config['serverUrl']
    if (url == null) return result

    result['url'] = url
    if (config['headers'] != null) result['headers'] = config['headers']

    return result
  }
}
