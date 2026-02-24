import type {FastCommandPrompt, McpServerConfig, OutputPluginContext, OutputWriteContext, RulePrompt, SkillPrompt, SubAgentPrompt, WriteResult, WriteResults} from '@truenine/plugin-shared'
import type {RelativePath} from '@truenine/plugin-shared/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {BaseCLIOutputPlugin} from '@truenine/plugin-output-shared'
import {applySubSeriesGlobPrefix, filterRulesByProjectConfig, filterSkillsByProjectConfig} from '@truenine/plugin-output-shared/utils'
import {FilePathKind, PLUGIN_NAMES} from '@truenine/plugin-shared'

const GLOBAL_MEMORY_FILE = 'AGENTS.md'
const GLOBAL_CONFIG_DIR = '.config/opencode'
const OPENCODE_CONFIG_FILE = 'opencode.json'
const OPENCODE_RULES_PLUGIN_NAME = 'opencode-rules@latest'
const PROJECT_RULES_DIR = '.opencode'
const RULES_SUBDIR = 'rules'
const RULE_FILE_PREFIX = 'rule-'

/**
 * Opencode CLI output plugin.
 * Outputs global memory, commands, agents, and skills to ~/.config/opencode/
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
      dependsOn: [PLUGIN_NAMES.AgentsOutput]
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

          const pluginField = existingConfig['plugin']
          if (Array.isArray(pluginField)) {
            const filtered = pluginField.filter(item => item !== OPENCODE_RULES_PLUGIN_NAME)
            if (filtered.length > 0) existingConfig['plugin'] = filtered
            else delete existingConfig['plugin']
          }

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

    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const filteredSkills = ctx.collectedInputContext.skills != null
      ? filterSkillsByProjectConfig(ctx.collectedInputContext.skills, projectConfig)
      : []
    const hasAnyMcpConfig = filteredSkills.some(s => s.mcpConfig != null)
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

    const globalRules = ctx.collectedInputContext.rules?.filter(r => this.normalizeRuleScope(r) === 'global')
    if (globalRules != null && globalRules.length > 0) {
      const rulesDir = path.join(globalDir, RULES_SUBDIR)
      for (const rule of globalRules) results.push(this.createRelativePath(this.buildRuleFileName(rule), rulesDir, () => RULES_SUBDIR))
    }

    return results.map(result => { // Normalize skill directory names in paths
      const normalizedPath = result.path.replaceAll('\\', '/')
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
    if (skills != null) {
      const projectConfig = this.resolvePromptSourceProjectConfig(ctx)
      const filteredSkills = filterSkillsByProjectConfig(skills, projectConfig)
      const mcpResult = await this.writeGlobalMcpConfig(ctx, filteredSkills)
      if (mcpResult != null) files.push(mcpResult)
    }

    const globalRules = ctx.collectedInputContext.rules?.filter(r => this.normalizeRuleScope(r) === 'global')
    if (globalRules == null || globalRules.length === 0) return {files, dirs: baseResults.dirs}

    const rulesDir = path.join(this.getGlobalConfigDir(), RULES_SUBDIR)
    for (const rule of globalRules) files.push(await this.writeFile(ctx, path.join(rulesDir, this.buildRuleFileName(rule)), this.buildRuleContent(rule), 'rule'))
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

    const pluginField = existingConfig['plugin']
    const plugins: string[] = Array.isArray(pluginField) ? pluginField.map(item => String(item)) : []
    if (!plugins.includes(OPENCODE_RULES_PLUGIN_NAME)) plugins.push(OPENCODE_RULES_PLUGIN_NAME)
    existingConfig['plugin'] = plugins

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
    const fileName = agent.dir.path.replace(/\.mdx$/, '.md')
    const targetDir = path.join(basePath, this.agentsSubDir)
    const fullPath = path.join(targetDir, fileName)

    const opencodeFrontMatter = this.buildOpencodeAgentFrontMatter(agent)
    const content = this.buildMarkdownContent(agent.content, opencodeFrontMatter)

    return [await this.writeFile(ctx, fullPath, content, 'subAgent')]
  }

  private buildOpencodeAgentFrontMatter(agent: SubAgentPrompt): Record<string, unknown> {
    const frontMatter: Record<string, unknown> = {}
    const source = agent.yamlFrontMatter as Record<string, unknown> | undefined

    if (source?.['description'] != null) frontMatter['description'] = source['description']

    frontMatter['mode'] = source?.['mode'] ?? 'subagent'

    if (source?.['model'] != null) frontMatter['model'] = source['model']
    if (source?.['temperature'] != null) frontMatter['temperature'] = source['temperature']
    if (source?.['maxSteps'] != null) frontMatter['maxSteps'] = source['maxSteps']
    if (source?.['hidden'] != null) frontMatter['hidden'] = source['hidden']

    if (source?.['allowTools'] != null && Array.isArray(source['allowTools'])) {
      const tools: Record<string, boolean> = {}
      for (const tool of source['allowTools']) tools[String(tool)] = true
      frontMatter['tools'] = tools
    }

    if (source?.['permission'] != null && typeof source['permission'] === 'object') frontMatter['permission'] = source['permission']

    for (const [key, value] of Object.entries(source ?? {})) {
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

    const opencodeFrontMatter = this.buildOpencodeCommandFrontMatter(cmd)
    const content = this.buildMarkdownContent(cmd.content, opencodeFrontMatter)

    return [await this.writeFile(ctx, fullPath, content, 'fastCommand')]
  }

  private buildOpencodeCommandFrontMatter(cmd: FastCommandPrompt): Record<string, unknown> {
    const frontMatter: Record<string, unknown> = {}
    const source = cmd.yamlFrontMatter as Record<string, unknown> | undefined

    if (source?.['description'] != null) frontMatter['description'] = source['description']
    if (source?.['agent'] != null) frontMatter['agent'] = source['agent']
    if (source?.['model'] != null) frontMatter['model'] = source['model']

    if (source?.['allowTools'] != null && Array.isArray(source['allowTools'])) {
      const tools: Record<string, boolean> = {}
      for (const tool of source['allowTools']) tools[String(tool)] = true
      frontMatter['tools'] = tools
    }

    for (const [key, value] of Object.entries(source ?? {})) {
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

    const opencodeFrontMatter = this.buildOpencodeSkillFrontMatter(skill, skillName)
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

    frontMatter['name'] = skillName
    if (source?.['description'] != null) frontMatter['description'] = source['description']

    frontMatter['license'] = source?.['license'] ?? 'MIT'
    frontMatter['compatibility'] = source?.['compatibility'] ?? 'opencode'

    const metadata: Record<string, unknown> = {}
    const metadataFields = ['author', 'version', 'keywords', 'category', 'repository', 'displayName']

    for (const field of metadataFields) {
      if (source?.[field] != null) metadata[field] = source[field]
    }

    const reservedFields = new Set(['name', 'description', 'license', 'compatibility', 'namingCase', 'allowTools', 'keywords', 'displayName', 'author', 'version'])
    for (const [key, value] of Object.entries(source ?? {})) {
      if (!reservedFields.has(key)) metadata[key] = value
    }

    if (Object.keys(metadata).length > 0) frontMatter['metadata'] = metadata

    return frontMatter
  }

  private validateAndNormalizeSkillName(name: string): string {
    let normalized = name.toLowerCase()
    normalized = normalized.replaceAll(/[^a-z0-9-]+/g, '-')
    normalized = normalized.replaceAll(/-+/g, '-')
    normalized = normalized.replaceAll(/^-|-$/g, '')

    if (normalized.length === 0) normalized = 'skill'
    else if (normalized.length > 64) {
      normalized = normalized.slice(0, 64)
      normalized = normalized.replace(/-$/, '')
    }

    return normalized
  }

  private buildRuleFileName(rule: RulePrompt): string {
    return `${RULE_FILE_PREFIX}${rule.series}-${rule.ruleName}.md`
  }

  private buildRuleContent(rule: RulePrompt): string {
    if (rule.globs.length === 0) return rule.content
    return this.buildMarkdownContent(rule.content, {globs: [...rule.globs]})
  }

  override async registerGlobalOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results = await super.registerGlobalOutputDirs(ctx)
    const globalRules = ctx.collectedInputContext.rules?.filter(r => this.normalizeRuleScope(r) === 'global')
    if (globalRules != null && globalRules.length > 0) results.push(this.createRelativePath(RULES_SUBDIR, this.getGlobalConfigDir(), () => RULES_SUBDIR))
    return results
  }

  override async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results = await super.registerProjectOutputDirs(ctx)
    const {rules} = ctx.collectedInputContext
    if (rules == null || rules.length === 0) return results
    for (const project of ctx.collectedInputContext.workspace.projects) {
      if (project.dirFromWorkspacePath == null) continue
      const projectRules = applySubSeriesGlobPrefix(
        filterRulesByProjectConfig(
          rules.filter(r => this.normalizeRuleScope(r) === 'project'),
          project.projectConfig
        ),
        project.projectConfig
      )
      if (projectRules.length === 0) continue
      const dirPath = path.join(project.dirFromWorkspacePath.path, PROJECT_RULES_DIR, RULES_SUBDIR)
      results.push(this.createRelativePath(dirPath, project.dirFromWorkspacePath.basePath, () => RULES_SUBDIR))
    }
    return results
  }

  override async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results = await super.registerProjectOutputFiles(ctx)
    const {rules} = ctx.collectedInputContext
    if (rules == null || rules.length === 0) return results
    for (const project of ctx.collectedInputContext.workspace.projects) {
      if (project.dirFromWorkspacePath == null) continue
      const projectRules = applySubSeriesGlobPrefix(
        filterRulesByProjectConfig(
          rules.filter(r => this.normalizeRuleScope(r) === 'project'),
          project.projectConfig
        ),
        project.projectConfig
      )
      for (const rule of projectRules) {
        const filePath = path.join(project.dirFromWorkspacePath.path, PROJECT_RULES_DIR, RULES_SUBDIR, this.buildRuleFileName(rule))
        results.push(this.createRelativePath(filePath, project.dirFromWorkspacePath.basePath, () => RULES_SUBDIR))
      }
    }
    return results
  }

  override async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    if ((ctx.collectedInputContext.rules?.length ?? 0) > 0) return true
    return super.canWrite(ctx)
  }

  override async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const results = await super.writeProjectOutputs(ctx)
    const {rules} = ctx.collectedInputContext
    if (rules == null || rules.length === 0) return results
    const ruleResults = []
    for (const project of ctx.collectedInputContext.workspace.projects) {
      if (project.dirFromWorkspacePath == null) continue
      const projectRules = applySubSeriesGlobPrefix(
        filterRulesByProjectConfig(
          rules.filter(r => this.normalizeRuleScope(r) === 'project'),
          project.projectConfig
        ),
        project.projectConfig
      )
      if (projectRules.length === 0) continue
      const rulesDir = path.join(project.dirFromWorkspacePath.basePath, project.dirFromWorkspacePath.path, PROJECT_RULES_DIR, RULES_SUBDIR)
      for (const rule of projectRules) ruleResults.push(await this.writeFile(ctx, path.join(rulesDir, this.buildRuleFileName(rule)), this.buildRuleContent(rule), 'rule'))
    }
    return {files: [...results.files, ...ruleResults], dirs: results.dirs}
  }
}
