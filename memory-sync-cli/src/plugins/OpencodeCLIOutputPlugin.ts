import type {FastCommandPrompt, McpServerConfig, OutputPluginContext, OutputWriteContext, SkillPrompt, SubAgentPrompt, WriteResult, WriteResults} from '@/types'
import type {RelativePath} from '@/types/FileSystemTypes'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {FilePathKind} from '@/types'
import {BaseCLIOutputPlugin} from './BaseCLIOutputPlugin'

const GLOBAL_MEMORY_FILE = 'AGENTS.md'
const GLOBAL_CONFIG_DIR = '.config/opencode'
const OPENCODE_CONFIG_FILE = 'opencode.json'

/**
 * Opencode CLI output plugin.
 * Outputs global memory, commands, agents, and skills to ~/.config/opencode/
 * - Global memory: ~/.config/opencode/AGENTS.md
 * - Commands: ~/.config/opencode/commands/
 * - Agents: ~/.config/opencode/agents/
 * - Skills: ~/.config/opencode/skills/<name>/SKILL.md
 *
 * Frontmatter is adapted to opencode format:
 * - Agents: description, mode, model, tools, temperature, maxSteps, hidden, permission
 * - Commands: description, agent, model, tools
 * - Skills: name, description, license, compatibility, metadata
 */
export class OpencodeCLIOutputPlugin extends BaseCLIOutputPlugin {
  constructor() {
    super('OpencodeCLIOutputPlugin', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
      outputFileName: GLOBAL_MEMORY_FILE,
      commandsSubDir: 'commands',
      agentsSubDir: 'agents',
      skillsSubDir: 'skills',
      supportsFastCommands: true,
      supportsSubAgents: true,
      supportsSkills: true,
      dependsOn: ['AgentsOutputPlugin']
    })

    this.registerCleanEffect('mcp-config-cleanup', async ctx => {
      const globalDir = this.getGlobalConfigDir()
      const configPath = path.join(globalDir, OPENCODE_CONFIG_FILE)

      if (ctx.dryRun === true) {
        this.log.trace({action: 'dryRun', type: 'mcpConfigCleanup', path: configPath})
        return {success: true, description: 'Would reset opencode.json mcp to empty'}
      }

      try {
        if (fs.existsSync(configPath)) {
          const existingContent = fs.readFileSync(configPath, 'utf8')
          const existingConfig = JSON.parse(existingContent) as Record<string, unknown>
          existingConfig['mcp'] = {}
          fs.writeFileSync(configPath, JSON.stringify(existingConfig, null, 2))
        }
        this.log.trace({action: 'clean', type: 'mcpConfigCleanup', path: configPath})
        return {success: true, description: 'Reset opencode.json mcp to empty'}
      }
      catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        this.log.error({action: 'clean', type: 'mcpConfigCleanup', path: configPath, error: errMsg})
        return {success: false, error: error as Error, description: 'Failed to reset opencode.json mcp'}
      }
    })
  }

  override async registerGlobalOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results = await super.registerGlobalOutputFiles(ctx)
    const globalDir = this.getGlobalConfigDir()

    const hasAnyMcpConfig = ctx.collectedInputContext.skills?.some(s => s.mcpConfig != null) ?? false
    if (hasAnyMcpConfig) {
      const configPath = path.join(globalDir, OPENCODE_CONFIG_FILE)
      results.push({
        pathKind: FilePathKind.Relative,
        path: OPENCODE_CONFIG_FILE,
        basePath: globalDir,
        getDirectoryName: () => GLOBAL_CONFIG_DIR,
        getAbsolutePath: () => configPath
      })
    }

    return results.map(result => { // Normalize skill directory names in paths
      const normalizedPath = result.path.replaceAll('\\', '/') // Normalize path separators for consistent checking
      const skillsPatternWithSlash = `/${this.skillsSubDir}/`
      const skillsPatternStart = `${this.skillsSubDir}/`

      if (!(normalizedPath.includes(skillsPatternWithSlash) || normalizedPath.startsWith(skillsPatternStart))) return result

      const pathParts = normalizedPath.split('/')
      const skillsIndex = pathParts.indexOf(this.skillsSubDir)
      if (skillsIndex < 0 || skillsIndex + 1 >= pathParts.length) return result

      const skillName = pathParts[skillsIndex + 1]
      if (skillName == null) return result

      const normalizedSkillName = this.validateAndNormalizeSkillName(skillName)
      const newPathParts = [...pathParts]
      newPathParts[skillsIndex + 1] = normalizedSkillName
      const newPath = newPathParts.join('/')
      return {
        ...result,
        path: newPath,
        getDirectoryName: () => normalizedSkillName,
        getAbsolutePath: () => path.join(globalDir, newPath.replaceAll('/', path.sep))
      }
    })
  }

  override async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const baseResults = await super.writeGlobalOutputs(ctx)
    const files = [...baseResults.files]

    const {skills} = ctx.collectedInputContext
    if (skills == null) return {files, dirs: baseResults.dirs}

    const mcpResult = await this.writeGlobalMcpConfig(ctx, skills)
    if (mcpResult != null) files.push(mcpResult)
    return {files, dirs: baseResults.dirs}
  }

  private async writeGlobalMcpConfig(
    ctx: OutputWriteContext,
    skills: readonly SkillPrompt[]
  ): Promise<WriteResult | null> {
    const mergedMcpServers: Record<string, unknown> = {}

    for (const skill of skills) {
      if (skill.mcpConfig == null) continue

      const {mcpServers} = skill.mcpConfig

      for (const [mcpName, mcpConfig] of Object.entries(mcpServers)) mergedMcpServers[mcpName] = this.transformMcpConfigForOpencode(mcpConfig)
    }

    if (Object.keys(mergedMcpServers).length === 0) return null

    const globalDir = this.getGlobalConfigDir()
    const configPath = path.join(globalDir, OPENCODE_CONFIG_FILE)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: OPENCODE_CONFIG_FILE,
      basePath: globalDir,
      getDirectoryName: () => GLOBAL_CONFIG_DIR,
      getAbsolutePath: () => configPath
    }

    let existingConfig: Record<string, unknown> = {}
    try {
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf8')
        existingConfig = JSON.parse(content) as Record<string, unknown>
      }
    }
    catch {
      existingConfig = {}
    }

    existingConfig['$schema'] = 'https://opencode.ai/config.json'
    existingConfig['mcp'] = mergedMcpServers

    const content = JSON.stringify(existingConfig, null, 2)

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'globalMcpConfig', path: configPath, serverCount: Object.keys(mergedMcpServers).length})
      return {path: relativePath, success: true, skipped: false}
    }

    try {
      this.ensureDirectory(globalDir)
      fs.writeFileSync(configPath, content)
      this.log.trace({action: 'write', type: 'globalMcpConfig', path: configPath, serverCount: Object.keys(mergedMcpServers).length})
      return {path: relativePath, success: true}
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'globalMcpConfig', path: configPath, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
  }

  private transformMcpConfigForOpencode(config: McpServerConfig): Record<string, unknown> {
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

  protected override async writeSubAgent(
    ctx: OutputWriteContext,
    basePath: string,
    agent: SubAgentPrompt
  ): Promise<WriteResult[]> {
    const fileName = agent.dir.path.endsWith('.md') ? agent.dir.path : `${agent.dir.path}.md`
    const targetDir = path.join(basePath, this.agentsSubDir)
    const fullPath = path.join(targetDir, fileName)

    const opencodeFrontMatter = this.buildOpencodeAgentFrontMatter(agent) // Build opencode-compatible frontmatter
    const content = this.buildMarkdownContent(agent.content, opencodeFrontMatter)

    return [await this.writeFile(ctx, fullPath, content, 'subAgent')]
  }

  private buildOpencodeAgentFrontMatter(agent: SubAgentPrompt): Record<string, unknown> {
    const frontMatter: Record<string, unknown> = {}
    const source = agent.yamlFrontMatter as Record<string, unknown> | undefined

    if (source?.['description'] != null) { // Required fields
      frontMatter['description'] = source['description']
    }

    frontMatter['mode'] = source?.['mode'] ?? 'subagent' // Mode: default to 'subagent' if not specified

    if (source?.['model'] != null) { // Optional fields
      frontMatter['model'] = source['model']
    }

    if (source?.['temperature'] != null) frontMatter['temperature'] = source['temperature']

    if (source?.['maxSteps'] != null) frontMatter['maxSteps'] = source['maxSteps']

    if (source?.['hidden'] != null) frontMatter['hidden'] = source['hidden']

    if (source?.['allowTools'] != null && Array.isArray(source['allowTools'])) { // Tools: convert allowTools array to tools object
      const tools: Record<string, boolean> = {}
      for (const tool of source['allowTools']) tools[String(tool)] = true
      frontMatter['tools'] = tools
    }

    if (source?.['permission'] != null && typeof source['permission'] === 'object') { // Permission configuration
      frontMatter['permission'] = source['permission']
    }

    for (const [key, value] of Object.entries(source ?? {})) { // Add any other fields from source
      if (!['description', 'mode', 'model', 'temperature', 'maxSteps', 'hidden', 'allowTools', 'permission', 'namingCase', 'name', 'color'].includes(key)) {
        frontMatter[key] = value
      }
    }

    return frontMatter
  }

  protected override async writeFastCommand(
    ctx: OutputWriteContext,
    basePath: string,
    cmd: FastCommandPrompt
  ): Promise<WriteResult[]> {
    const transformOptions = this.getTransformOptionsFromContext(ctx)
    const fileName = this.transformFastCommandName(cmd, transformOptions)
    const targetDir = path.join(basePath, this.commandsSubDir)
    const fullPath = path.join(targetDir, fileName)

    const opencodeFrontMatter = this.buildOpencodeCommandFrontMatter(cmd) // Build opencode-compatible frontmatter
    const content = this.buildMarkdownContent(cmd.content, opencodeFrontMatter)

    return [await this.writeFile(ctx, fullPath, content, 'fastCommand')]
  }

  private buildOpencodeCommandFrontMatter(cmd: FastCommandPrompt): Record<string, unknown> {
    const frontMatter: Record<string, unknown> = {}
    const source = cmd.yamlFrontMatter as Record<string, unknown> | undefined

    if (source?.['description'] != null) { // Optional fields
      frontMatter['description'] = source['description']
    }

    if (source?.['agent'] != null) { // Agent reference: default to 'build' if not specified
      frontMatter['agent'] = source['agent']
    }

    if (source?.['model'] != null) frontMatter['model'] = source['model']

    if (source?.['allowTools'] != null && Array.isArray(source['allowTools'])) { // Tools: convert allowTools array to tools object
      const tools: Record<string, boolean> = {}
      for (const tool of source['allowTools']) tools[String(tool)] = true
      frontMatter['tools'] = tools
    }

    for (const [key, value] of Object.entries(source ?? {})) { // Add any other fields from source
      if (!['description', 'agent', 'model', 'allowTools', 'namingCase', 'argumentHint'].includes(key)) frontMatter[key] = value
    }

    return frontMatter
  }

  protected override async writeSkill(
    ctx: OutputWriteContext,
    basePath: string,
    skill: SkillPrompt
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const skillName = this.validateAndNormalizeSkillName((skill.yamlFrontMatter?.name as string | undefined) ?? skill.dir.getDirectoryName())
    const targetDir = path.join(basePath, this.skillsSubDir, skillName)
    const fullPath = path.join(targetDir, 'SKILL.md')

    const opencodeFrontMatter = this.buildOpencodeSkillFrontMatter(skill, skillName) // Build opencode-compatible frontmatter
    const content = this.buildMarkdownContent(skill.content as string, opencodeFrontMatter)

    const mainFileResult = await this.writeFile(ctx, fullPath, content, 'skill')
    results.push(mainFileResult)

    if (skill.childDocs != null) {
      for (const refDoc of skill.childDocs) {
        const refResults = await this.writeSkillReferenceDocument(ctx, targetDir, skillName, refDoc, basePath)
        results.push(...refResults)
      }
    }

    if (skill.resources != null) {
      for (const resource of skill.resources) {
        const refResults = await this.writeSkillResource(ctx, targetDir, skillName, resource, basePath)
        results.push(...refResults)
      }
    }

    return results
  }

  private buildOpencodeSkillFrontMatter(skill: SkillPrompt, skillName: string): Record<string, unknown> {
    const frontMatter: Record<string, unknown> = {}
    const source = skill.yamlFrontMatter as Record<string, unknown> | undefined

    frontMatter['name'] = skillName // Required fields
    if (source?.['description'] != null) frontMatter['description'] = source['description']

    frontMatter['license'] = source?.['license'] ?? 'MIT' // Optional fields with defaults
    frontMatter['compatibility'] = source?.['compatibility'] ?? 'opencode'

    const metadata: Record<string, unknown> = {} // Metadata: collect additional fields
    const metadataFields = ['author', 'version', 'keywords', 'category', 'repository', 'displayName']

    for (const field of metadataFields) {
      if (source?.[field] != null) metadata[field] = source[field]
    }

    const reservedFields = new Set(['name', 'description', 'license', 'compatibility', 'namingCase', 'allowTools', 'keywords', 'displayName', 'author', 'version']) // Add other non-standard fields to metadata
    for (const [key, value] of Object.entries(source ?? {})) {
      if (!reservedFields.has(key)) metadata[key] = value
    }

    if (Object.keys(metadata).length > 0) frontMatter['metadata'] = metadata

    return frontMatter
  }

  private validateAndNormalizeSkillName(name: string): string {
    let normalized = name.toLowerCase() // Normalize to lowercase

    normalized = normalized.replaceAll(/[^a-z0-9-]+/g, '-') // Replace invalid characters with hyphens

    normalized = normalized.replaceAll(/-+/g, '-') // Remove consecutive hyphens

    normalized = normalized.replaceAll(/^-|-$/g, '') // Trim hyphens from start and end

    if (normalized.length === 0) { // Ensure length constraints (1-64 chars)
      normalized = 'skill'
    } else if (normalized.length > 64) {
      normalized = normalized.slice(0, 64)
      normalized = normalized.replace(/-$/, '') // Ensure doesn't end with hyphen after truncation
    }

    return normalized
  }
}
