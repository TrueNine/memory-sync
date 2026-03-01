import type {
  FastCommandPrompt,
  OutputPluginContext,
  OutputWriteContext,
  RulePrompt,
  SkillPrompt,
  WriteResult,
  WriteResults
} from '@truenine/plugin-shared'
import type {RelativePath} from '@truenine/plugin-shared/types'
import {Buffer} from 'node:buffer'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {buildMarkdownWithFrontMatter} from '@truenine/md-compiler/markdown'
import {AbstractOutputPlugin, applySubSeriesGlobPrefix, filterCommandsByProjectConfig, filterRulesByProjectConfig, filterSkillsByProjectConfig} from '@truenine/plugin-output-shared'
import {FilePathKind, PLUGIN_NAMES} from '@truenine/plugin-shared'

const GLOBAL_CONFIG_DIR = '.cursor'
const MCP_CONFIG_FILE = 'mcp.json'
const COMMANDS_SUBDIR = 'commands'
const RULES_SUBDIR = 'rules'
const GLOBAL_RULE_FILE = 'global.mdc'
const SKILLS_CURSOR_SUBDIR = 'skills-cursor'
const SKILL_FILE_NAME = 'SKILL.md'
const RULE_FILE_PREFIX = 'rule-'

const PRESERVED_SKILLS = new Set<string>([
  'create-rule',
  'create-skill',
  'create-subagent',
  'migrate-to-skills',
  'update-cursor-settings'
])

export class CursorOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('CursorOutputPlugin', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
      outputFileName: '',
      dependsOn: [PLUGIN_NAMES.AgentsOutput],
      indexignore: '.cursorignore'
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

  async registerGlobalOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const globalDir = this.getGlobalConfigDir()
    const {fastCommands, skills, rules} = ctx.collectedInputContext
    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)

    if (fastCommands != null && fastCommands.length > 0) {
      const filteredCommands = filterCommandsByProjectConfig(fastCommands, projectConfig)
      if (filteredCommands.length > 0) {
        const commandsDir = this.getGlobalCommandsDir()
        results.push({pathKind: FilePathKind.Relative, path: COMMANDS_SUBDIR, basePath: globalDir, getDirectoryName: () => COMMANDS_SUBDIR, getAbsolutePath: () => commandsDir})
      }
    }

    if (skills != null && skills.length > 0) {
      const filteredSkills = filterSkillsByProjectConfig(skills, projectConfig)
      for (const skill of filteredSkills) {
        const skillName = skill.yamlFrontMatter.name
        if (this.isPreservedSkill(skillName)) continue
        const skillPath = path.join(globalDir, SKILLS_CURSOR_SUBDIR, skillName)
        results.push({pathKind: FilePathKind.Relative, path: path.join(SKILLS_CURSOR_SUBDIR, skillName), basePath: globalDir, getDirectoryName: () => skillName, getAbsolutePath: () => skillPath})
      }
    }

    const globalRules = rules?.filter(r => this.normalizeRuleScope(r) === 'global')
    if (globalRules == null || globalRules.length === 0) return results

    const globalRulesDir = path.join(globalDir, RULES_SUBDIR)
    results.push({pathKind: FilePathKind.Relative, path: RULES_SUBDIR, basePath: globalDir, getDirectoryName: () => RULES_SUBDIR, getAbsolutePath: () => globalRulesDir})
    return results
  }

  async registerGlobalOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const globalDir = this.getGlobalConfigDir()
    const {skills, fastCommands} = ctx.collectedInputContext
    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const filteredSkills = skills != null ? filterSkillsByProjectConfig(skills, projectConfig) : []
    const hasAnyMcpConfig = filteredSkills.some(s => s.mcpConfig != null)

    if (hasAnyMcpConfig) {
      const mcpConfigPath = path.join(globalDir, MCP_CONFIG_FILE)
      results.push({pathKind: FilePathKind.Relative, path: MCP_CONFIG_FILE, basePath: globalDir, getDirectoryName: () => GLOBAL_CONFIG_DIR, getAbsolutePath: () => mcpConfigPath})
    }

    if (fastCommands != null && fastCommands.length > 0) {
      const filteredCommands = filterCommandsByProjectConfig(fastCommands, projectConfig)
      const commandsDir = this.getGlobalCommandsDir()
      const transformOptions = this.getTransformOptionsFromContext(ctx, {includeSeriesPrefix: true})
      for (const cmd of filteredCommands) {
        const fileName = this.transformFastCommandName(cmd, transformOptions)
        const fullPath = path.join(commandsDir, fileName)
        results.push({pathKind: FilePathKind.Relative, path: path.join(COMMANDS_SUBDIR, fileName), basePath: globalDir, getDirectoryName: () => COMMANDS_SUBDIR, getAbsolutePath: () => fullPath})
      }
    }

    const globalRules = ctx.collectedInputContext.rules?.filter(r => this.normalizeRuleScope(r) === 'global')
    if (globalRules != null && globalRules.length > 0) {
      const globalRulesDir = path.join(globalDir, RULES_SUBDIR)
      for (const rule of globalRules) {
        const fileName = this.buildRuleFileName(rule)
        const fullPath = path.join(globalRulesDir, fileName)
        results.push({pathKind: FilePathKind.Relative, path: path.join(RULES_SUBDIR, fileName), basePath: globalDir, getDirectoryName: () => RULES_SUBDIR, getAbsolutePath: () => fullPath})
      }
    }

    if (filteredSkills.length === 0) return results

    const skillsCursorDir = this.getSkillsCursorDir()
    for (const skill of filteredSkills) {
      const skillName = skill.yamlFrontMatter.name
      if (this.isPreservedSkill(skillName)) continue
      const skillDir = path.join(skillsCursorDir, skillName)
      results.push({pathKind: FilePathKind.Relative, path: path.join(SKILLS_CURSOR_SUBDIR, skillName, SKILL_FILE_NAME), basePath: globalDir, getDirectoryName: () => skillName, getAbsolutePath: () => path.join(skillDir, SKILL_FILE_NAME)})

      if (skill.mcpConfig != null) results.push({pathKind: FilePathKind.Relative, path: path.join(SKILLS_CURSOR_SUBDIR, skillName, MCP_CONFIG_FILE), basePath: globalDir, getDirectoryName: () => skillName, getAbsolutePath: () => path.join(skillDir, MCP_CONFIG_FILE)})

      if (skill.childDocs != null) {
        for (const childDoc of skill.childDocs) {
          const outputRelativePath = childDoc.relativePath.replace(/\.mdx$/, '.md')
          results.push({pathKind: FilePathKind.Relative, path: path.join(SKILLS_CURSOR_SUBDIR, skillName, outputRelativePath), basePath: globalDir, getDirectoryName: () => skillName, getAbsolutePath: () => path.join(skillDir, outputRelativePath)})
        }
      }

      if (skill.resources != null) {
        for (const resource of skill.resources) results.push({pathKind: FilePathKind.Relative, path: path.join(SKILLS_CURSOR_SUBDIR, skillName, resource.relativePath), basePath: globalDir, getDirectoryName: () => skillName, getAbsolutePath: () => path.join(skillDir, resource.relativePath)})
      }
    }
    return results
  }

  async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {workspace, globalMemory, rules} = ctx.collectedInputContext
    const hasProjectRules = rules?.some(r => this.normalizeRuleScope(r) === 'project') ?? false
    if (globalMemory == null && !hasProjectRules) return results
    for (const project of workspace.projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue
      results.push(this.createProjectRulesDirRelativePath(projectDir))
    }
    return results
  }

  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {workspace, globalMemory, rules} = ctx.collectedInputContext
    if (globalMemory == null && rules == null) return results

    if (globalMemory != null) {
      for (const project of workspace.projects) {
        const projectDir = project.dirFromWorkspacePath
        if (projectDir == null) continue
        results.push(this.createProjectRuleFileRelativePath(projectDir, GLOBAL_RULE_FILE))
      }
    }

    if (rules != null && rules.length > 0) {
      for (const project of workspace.projects) {
        const projectDir = project.dirFromWorkspacePath
        if (projectDir == null) continue
        const projectRules = applySubSeriesGlobPrefix(filterRulesByProjectConfig(rules.filter(r => this.normalizeRuleScope(r) === 'project'), project.projectConfig), project.projectConfig)
        for (const rule of projectRules) results.push(this.createProjectRuleFileRelativePath(projectDir, this.buildRuleFileName(rule)))
      }
    }

    results.push(...this.registerProjectIgnoreOutputFiles(workspace.projects))
    return results
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {workspace, skills, fastCommands, globalMemory, rules, aiAgentIgnoreConfigFiles} = ctx.collectedInputContext
    const hasSkills = (skills?.length ?? 0) > 0
    const hasFastCommands = (fastCommands?.length ?? 0) > 0
    const hasRules = (rules?.length ?? 0) > 0
    const hasGlobalRuleOutput = globalMemory != null && workspace.projects.some(p => p.dirFromWorkspacePath != null)
    const hasCursorIgnore = aiAgentIgnoreConfigFiles?.some(f => f.fileName === '.cursorignore') ?? false
    if (hasSkills || hasFastCommands || hasGlobalRuleOutput || hasRules || hasCursorIgnore) return true
    this.log.trace({action: 'skip', reason: 'noOutputs'})
    return false
  }

  async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {skills, fastCommands, rules} = ctx.collectedInputContext
    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    if (skills != null && skills.length > 0) {
      const filteredSkills = filterSkillsByProjectConfig(skills, projectConfig)
      const mcpResult = await this.writeGlobalMcpConfig(ctx, filteredSkills)
      if (mcpResult != null) fileResults.push(mcpResult)
      const skillsCursorDir = this.getSkillsCursorDir()
      for (const skill of filteredSkills) {
        const skillName = skill.yamlFrontMatter.name
        if (this.isPreservedSkill(skillName)) continue
        fileResults.push(...await this.writeGlobalSkill(ctx, skillsCursorDir, skill))
      }
    }

    if (fastCommands != null && fastCommands.length > 0) {
      const filteredCommands = filterCommandsByProjectConfig(fastCommands, projectConfig)
      const commandsDir = this.getGlobalCommandsDir()
      for (const cmd of filteredCommands) fileResults.push(await this.writeGlobalFastCommand(ctx, commandsDir, cmd))
    }

    const globalRules = rules?.filter(r => this.normalizeRuleScope(r) === 'global')
    if (globalRules == null || globalRules.length === 0) return {files: fileResults, dirs: dirResults}

    const globalRulesDir = path.join(this.getGlobalConfigDir(), RULES_SUBDIR)
    for (const rule of globalRules) fileResults.push(await this.writeRuleMdcFile(ctx, globalRulesDir, rule, this.getGlobalConfigDir()))
    return {files: fileResults, dirs: dirResults}
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []
    const {workspace, globalMemory, rules} = ctx.collectedInputContext
    if (globalMemory != null) {
      const content = this.buildGlobalRuleContent(globalMemory.content as string)
      for (const project of workspace.projects) {
        if (project.dirFromWorkspacePath == null) continue
        fileResults.push(await this.writeProjectGlobalRule(ctx, project, content))
      }
    }

    if (rules != null && rules.length > 0) {
      for (const project of workspace.projects) {
        const projectDir = project.dirFromWorkspacePath
        if (projectDir == null) continue
        const projectRules = applySubSeriesGlobPrefix(filterRulesByProjectConfig(rules.filter(r => this.normalizeRuleScope(r) === 'project'), project.projectConfig), project.projectConfig)
        if (projectRules.length === 0) continue
        const rulesDir = path.join(projectDir.basePath, projectDir.path, GLOBAL_CONFIG_DIR, RULES_SUBDIR)
        for (const rule of projectRules) fileResults.push(await this.writeRuleMdcFile(ctx, rulesDir, rule, projectDir.basePath))
      }
    }

    fileResults.push(...await this.writeProjectIgnoreFiles(ctx))
    return {files: fileResults, dirs: dirResults}
  }

  private createProjectRulesDirRelativePath(projectDir: RelativePath): RelativePath {
    const rulesDirPath = path.join(projectDir.path, GLOBAL_CONFIG_DIR, RULES_SUBDIR)
    return {pathKind: FilePathKind.Relative, path: rulesDirPath, basePath: projectDir.basePath, getDirectoryName: () => RULES_SUBDIR, getAbsolutePath: () => path.join(projectDir.basePath, rulesDirPath)}
  }

  private createProjectRuleFileRelativePath(projectDir: RelativePath, fileName: string): RelativePath {
    const filePath = path.join(projectDir.path, GLOBAL_CONFIG_DIR, RULES_SUBDIR, fileName)
    return {pathKind: FilePathKind.Relative, path: filePath, basePath: projectDir.basePath, getDirectoryName: () => RULES_SUBDIR, getAbsolutePath: () => path.join(projectDir.basePath, filePath)}
  }

  private buildGlobalRuleContent(content: string): string {
    return buildMarkdownWithFrontMatter({description: 'Global prompt (synced)', alwaysApply: true}, content)
  }

  private async writeProjectGlobalRule(ctx: OutputWriteContext, project: {dirFromWorkspacePath?: RelativePath | null}, content: string): Promise<WriteResult> {
    const projectDir = project.dirFromWorkspacePath!
    const rulesDir = path.join(projectDir.basePath, projectDir.path, GLOBAL_CONFIG_DIR, RULES_SUBDIR)
    const fullPath = path.join(rulesDir, GLOBAL_RULE_FILE)
    const relativePath = this.createProjectRuleFileRelativePath(projectDir, GLOBAL_RULE_FILE)

    return this.writeFileWithHandling(ctx, fullPath, content, {
      type: 'globalRule',
      relativePath
    })
  }

  private isPreservedSkill(name: string): boolean { return PRESERVED_SKILLS.has(name) }
  private getSkillsCursorDir(): string { return path.join(this.getGlobalConfigDir(), SKILLS_CURSOR_SUBDIR) }
  private getGlobalCommandsDir(): string { return path.join(this.getGlobalConfigDir(), COMMANDS_SUBDIR) }

  private async writeGlobalFastCommand(ctx: OutputWriteContext, commandsDir: string, cmd: FastCommandPrompt): Promise<WriteResult> {
    const transformOptions = this.getTransformOptionsFromContext(ctx, {includeSeriesPrefix: true})
    const fileName = this.transformFastCommandName(cmd, transformOptions)
    const fullPath = path.join(commandsDir, fileName)
    const globalDir = this.getGlobalConfigDir()
    const relativePath: RelativePath = {pathKind: FilePathKind.Relative, path: path.join(COMMANDS_SUBDIR, fileName), basePath: globalDir, getDirectoryName: () => COMMANDS_SUBDIR, getAbsolutePath: () => fullPath}
    const content = this.buildMarkdownContentWithRaw(cmd.content, cmd.yamlFrontMatter, cmd.rawFrontMatter)

    return this.writeFileWithHandling(ctx, fullPath, content, {
      type: 'globalFastCommand',
      relativePath
    })
  }

  private async writeGlobalMcpConfig(ctx: OutputWriteContext, skills: readonly SkillPrompt[]): Promise<WriteResult | null> {
    const mergedMcpServers: Record<string, unknown> = {}
    for (const skill of skills) {
      if (skill.mcpConfig == null) continue
      for (const [mcpName, mcpConfig] of Object.entries(skill.mcpConfig.mcpServers)) mergedMcpServers[mcpName] = this.transformMcpConfigForCursor({...(mcpConfig as unknown as Record<string, unknown>)})
    }
    if (Object.keys(mergedMcpServers).length === 0) return null

    const globalDir = this.getGlobalConfigDir()
    const mcpConfigPath = path.join(globalDir, MCP_CONFIG_FILE)
    const relativePath: RelativePath = {pathKind: FilePathKind.Relative, path: MCP_CONFIG_FILE, basePath: globalDir, getDirectoryName: () => GLOBAL_CONFIG_DIR, getAbsolutePath: () => mcpConfigPath}

    let existingConfig: Record<string, unknown> = {}
    try { if (this.existsSync(mcpConfigPath)) existingConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8')) as Record<string, unknown> }
    catch { existingConfig = {} }

    const existingMcpServers = (existingConfig['mcpServers'] as Record<string, unknown>) ?? {}
    existingConfig['mcpServers'] = {...existingMcpServers, ...mergedMcpServers}
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

  private async writeGlobalSkill(ctx: OutputWriteContext, skillsDir: string, skill: SkillPrompt): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const skillName = skill.yamlFrontMatter.name
    const skillDir = path.join(skillsDir, skillName)
    const skillFilePath = path.join(skillDir, SKILL_FILE_NAME)
    const globalDir = this.getGlobalConfigDir()
    const skillRelativePath: RelativePath = {pathKind: FilePathKind.Relative, path: path.join(SKILLS_CURSOR_SUBDIR, skillName, SKILL_FILE_NAME), basePath: globalDir, getDirectoryName: () => skillName, getAbsolutePath: () => skillFilePath}

    const frontMatterData = this.buildSkillFrontMatter(skill)
    const skillContent = buildMarkdownWithFrontMatter(frontMatterData, skill.content as string)

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'skill', path: skillFilePath})
      results.push({path: skillRelativePath, success: true, skipped: false})
    } else {
      try {
        this.ensureDirectory(skillDir)
        this.writeFileSync(skillFilePath, skillContent)
        this.log.trace({action: 'write', type: 'skill', path: skillFilePath})
        results.push({path: skillRelativePath, success: true})
      }
      catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        this.log.error({action: 'write', type: 'skill', path: skillFilePath, error: errMsg})
        results.push({path: skillRelativePath, success: false, error: error as Error})
      }
    }

    if (skill.mcpConfig != null) results.push(await this.writeSkillMcpConfig(ctx, skill, skillDir, globalDir))
    if (skill.childDocs != null) { for (const childDoc of skill.childDocs) results.push(await this.writeSkillChildDoc(ctx, childDoc, skillDir, skillName, globalDir)) }
    if (skill.resources != null) { for (const resource of skill.resources) results.push(await this.writeSkillResource(ctx, resource, skillDir, skillName, globalDir)) }
    return results
  }

  private async writeSkillMcpConfig(ctx: OutputWriteContext, skill: SkillPrompt, skillDir: string, globalDir: string): Promise<WriteResult> {
    const skillName = skill.yamlFrontMatter.name
    const mcpConfigPath = path.join(skillDir, MCP_CONFIG_FILE)
    const relativePath: RelativePath = {pathKind: FilePathKind.Relative, path: path.join(SKILLS_CURSOR_SUBDIR, skillName, MCP_CONFIG_FILE), basePath: globalDir, getDirectoryName: () => skillName, getAbsolutePath: () => mcpConfigPath}
    const mcpConfigContent = skill.mcpConfig!.rawContent
    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'mcpConfig', path: mcpConfigPath})
      return {path: relativePath, success: true, skipped: false}
    }
    try {
      this.ensureDirectory(skillDir)
      this.writeFileSync(mcpConfigPath, mcpConfigContent)
      this.log.trace({action: 'write', type: 'mcpConfig', path: mcpConfigPath})
      return {path: relativePath, success: true}
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'mcpConfig', path: mcpConfigPath, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
  }

  private async writeSkillChildDoc(ctx: OutputWriteContext, childDoc: {relativePath: string, content: unknown}, skillDir: string, skillName: string, globalDir: string): Promise<WriteResult> {
    const outputRelativePath = childDoc.relativePath.replace(/\.mdx$/, '.md')
    const childDocPath = path.join(skillDir, outputRelativePath)
    const relativePath: RelativePath = {pathKind: FilePathKind.Relative, path: path.join(SKILLS_CURSOR_SUBDIR, skillName, outputRelativePath), basePath: globalDir, getDirectoryName: () => skillName, getAbsolutePath: () => childDocPath}
    const content = childDoc.content as string
    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'childDoc', path: childDocPath})
      return {path: relativePath, success: true, skipped: false}
    }
    try {
      const parentDir = path.dirname(childDocPath)
      this.ensureDirectory(parentDir)
      this.writeFileSync(childDocPath, content)
      this.log.trace({action: 'write', type: 'childDoc', path: childDocPath})
      return {path: relativePath, success: true}
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'childDoc', path: childDocPath, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
  }

  private async writeSkillResource(ctx: OutputWriteContext, resource: {relativePath: string, content: string, encoding: 'text' | 'base64'}, skillDir: string, skillName: string, globalDir: string): Promise<WriteResult> {
    const resourcePath = path.join(skillDir, resource.relativePath)
    const relativePath: RelativePath = {pathKind: FilePathKind.Relative, path: path.join(SKILLS_CURSOR_SUBDIR, skillName, resource.relativePath), basePath: globalDir, getDirectoryName: () => skillName, getAbsolutePath: () => resourcePath}
    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'resource', path: resourcePath})
      return {path: relativePath, success: true, skipped: false}
    }
    try {
      const parentDir = path.dirname(resourcePath)
      this.ensureDirectory(parentDir)
      if (resource.encoding === 'base64') {
        const buffer = Buffer.from(resource.content, 'base64')
        this.writeFileSyncBuffer(resourcePath, buffer)
      } else this.writeFileSync(resourcePath, resource.content)
      this.log.trace({action: 'write', type: 'resource', path: resourcePath})
      return {path: relativePath, success: true}
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'resource', path: resourcePath, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
  }

  protected buildRuleMdcContent(rule: RulePrompt): string {
    const fmData: Record<string, unknown> = {alwaysApply: false, globs: rule.globs.length > 0 ? rule.globs.join(', ') : ''}
    const raw = buildMarkdownWithFrontMatter(fmData, rule.content)
    const lines = raw.split('\n')
    const transformedLines = lines.map(line => {
      const match = /^(\s*globs:\s*)(['"])(.*)\2\s*$/.exec(line)
      if (match == null) return line
      const prefix = match[1] ?? 'globs: '
      const value = match[3] ?? ''
      if (value.trim().length === 0) return line
      return `${prefix}${value}`
    })
    return transformedLines.join('\n')
  }

  private async writeRuleMdcFile(ctx: OutputWriteContext, rulesDir: string, rule: RulePrompt, basePath: string): Promise<WriteResult> {
    const fileName = this.buildRuleFileName(rule, RULE_FILE_PREFIX)
    const fullPath = path.join(rulesDir, fileName)
    const relativePath: RelativePath = {pathKind: FilePathKind.Relative, path: path.join(GLOBAL_CONFIG_DIR, RULES_SUBDIR, fileName), basePath, getDirectoryName: () => RULES_SUBDIR, getAbsolutePath: () => fullPath}
    const content = this.buildRuleMdcContent(rule)

    return this.writeFileWithHandling(ctx, fullPath, content, {
      type: 'ruleFile',
      relativePath
    })
  }
}
