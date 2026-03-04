import type {
  CommandPrompt,
  OutputPluginContext,
  OutputWriteContext,
  RulePrompt,
  SkillPrompt,
  WriteResult,
  WriteResults
} from '../plugin-core'
import {Buffer} from 'node:buffer'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {buildMarkdownWithFrontMatter} from '@truenine/md-compiler/markdown'
import {
  AbstractOutputPlugin,
  applySubSeriesGlobPrefix,
  filterCommandsByProjectConfig,
  filterRulesByProjectConfig,
  filterSkillsByProjectConfig,
  GlobalConfigDirs,
  IgnoreFiles,
  McpConfigManager,
  OutputFileNames,
  OutputSubdirectories,
  PreservedSkills,
  transformMcpConfigForCursor
} from '../plugin-core'
import {PLUGIN_NAMES} from '../plugin-core'

const GLOBAL_CONFIG_DIR = GlobalConfigDirs.CURSOR // Constants for local use (consider moving to constants.ts if used by multiple plugins)
const MCP_CONFIG_FILE = OutputFileNames.MCP_CONFIG
const COMMANDS_SUBDIR = OutputSubdirectories.COMMANDS
const RULES_SUBDIR = OutputSubdirectories.RULES
const GLOBAL_RULE_FILE = OutputFileNames.CURSOR_GLOBAL_RULE
const SKILLS_CURSOR_SUBDIR = OutputSubdirectories.CURSOR_SKILLS
const SKILL_FILE_NAME = OutputFileNames.SKILL
const PRESERVED_SKILLS = PreservedSkills.CURSOR

export class CursorOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('CursorOutputPlugin', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
      outputFileName: '',
      dependsOn: [PLUGIN_NAMES.AgentsOutput],
      indexignore: IgnoreFiles.CURSOR,
      rules: {
        enabled: true,
        subDir: RULES_SUBDIR,
        prefix: 'rule' // Note: 'rule' not 'rule-' - linkSymbol adds the separator
      }
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

  override async registerGlobalOutputDirs(ctx: OutputPluginContext): Promise<string[]> {
    const results: string[] = []
    const globalDir = this.getGlobalConfigDir()
    const {commands, skills, rules} = ctx.collectedInputContext
    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)

    if (commands != null && commands.length > 0) {
      const filteredCommands = filterCommandsByProjectConfig(commands, projectConfig)
      if (filteredCommands.length > 0) results.push(path.join(globalDir, COMMANDS_SUBDIR))
    }

    if (skills != null && skills.length > 0) {
      const filteredSkills = filterSkillsByProjectConfig(skills, projectConfig)
      for (const skill of filteredSkills) {
        const skillName = skill.yamlFrontMatter.name
        if (this.isPreservedSkill(skillName)) continue
        results.push(path.join(globalDir, SKILLS_CURSOR_SUBDIR, skillName))
      }
    }

    const globalRules = rules?.filter(r => this.normalizeRuleScope(r) === 'global')
    if (globalRules == null || globalRules.length === 0) return results

    results.push(path.join(globalDir, RULES_SUBDIR))
    return results
  }

  override async registerGlobalOutputFiles(ctx: OutputPluginContext): Promise<string[]> {
    const results: string[] = []
    const globalDir = this.getGlobalConfigDir()
    const {skills, commands} = ctx.collectedInputContext
    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const filteredSkills = skills != null ? filterSkillsByProjectConfig(skills, projectConfig) : []
    const hasAnyMcpConfig = filteredSkills.some(s => s.mcpConfig != null)

    if (hasAnyMcpConfig) results.push(path.join(globalDir, MCP_CONFIG_FILE))

    if (commands != null && commands.length > 0) {
      const filteredCommands = filterCommandsByProjectConfig(commands, projectConfig)
      const transformOptions = this.getTransformOptionsFromContext(ctx, {includeSeriesPrefix: true})
      for (const cmd of filteredCommands) {
        const fileName = this.transformCommandName(cmd, transformOptions)
        results.push(path.join(globalDir, COMMANDS_SUBDIR, fileName))
      }
    }

    const globalRules = ctx.collectedInputContext.rules?.filter(r => this.normalizeRuleScope(r) === 'global')
    if (globalRules != null && globalRules.length > 0) {
      for (const rule of globalRules) {
        const fileName = this.buildRuleFileName(rule)
        results.push(path.join(globalDir, RULES_SUBDIR, fileName))
      }
    }

    if (filteredSkills.length === 0) return results

    for (const skill of filteredSkills) {
      const skillName = skill.yamlFrontMatter.name
      if (this.isPreservedSkill(skillName)) continue
      results.push(path.join(globalDir, SKILLS_CURSOR_SUBDIR, skillName, SKILL_FILE_NAME))

      if (skill.mcpConfig != null) results.push(path.join(globalDir, SKILLS_CURSOR_SUBDIR, skillName, MCP_CONFIG_FILE))

      if (skill.childDocs != null) {
        for (const childDoc of skill.childDocs) {
          const outputRelativePath = childDoc.relativePath.replace(/\.mdx$/, '.md')
          results.push(path.join(globalDir, SKILLS_CURSOR_SUBDIR, skillName, outputRelativePath))
        }
      }

      if (skill.resources != null) {
        for (const resource of skill.resources) results.push(path.join(globalDir, SKILLS_CURSOR_SUBDIR, skillName, resource.relativePath))
      }
    }
    return results
  }

  override async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<string[]> {
    const results: string[] = []
    const {workspace, globalMemory, rules} = ctx.collectedInputContext
    const hasProjectRules = rules?.some(r => this.normalizeRuleScope(r) === 'project') ?? false
    if (globalMemory == null && !hasProjectRules) return results
    for (const project of workspace.projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue
      results.push(path.join(projectDir.path, GLOBAL_CONFIG_DIR, RULES_SUBDIR))
    }
    return results
  }

  override async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<string[]> {
    const results: string[] = []
    const {workspace, globalMemory, rules} = ctx.collectedInputContext
    if (globalMemory == null && rules == null) return results

    if (globalMemory != null) {
      for (const project of workspace.projects) {
        const projectDir = project.dirFromWorkspacePath
        if (projectDir == null) continue
        results.push(path.join(projectDir.path, GLOBAL_CONFIG_DIR, RULES_SUBDIR, GLOBAL_RULE_FILE))
      }
    }

    if (rules != null && rules.length > 0) {
      for (const project of workspace.projects) {
        const projectDir = project.dirFromWorkspacePath
        if (projectDir == null) continue
        const projectRules = applySubSeriesGlobPrefix(filterRulesByProjectConfig(rules.filter(r => this.normalizeRuleScope(r) === 'project'), project.projectConfig), project.projectConfig)
        for (const rule of projectRules) results.push(path.join(projectDir.path, GLOBAL_CONFIG_DIR, RULES_SUBDIR, this.buildRuleFileName(rule)))
      }
    }

    results.push(...this.registerProjectIgnoreOutputFiles(workspace.projects))
    return results
  }

  override async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {workspace, skills, commands, globalMemory, rules, aiAgentIgnoreConfigFiles} = ctx.collectedInputContext
    const hasSkills = (skills?.length ?? 0) > 0
    const hasFastCommands = (commands?.length ?? 0) > 0
    const hasRules = (rules?.length ?? 0) > 0
    const hasGlobalRuleOutput = globalMemory != null && workspace.projects.some(p => p.dirFromWorkspacePath != null)
    const hasCursorIgnore = aiAgentIgnoreConfigFiles?.some(f => f.fileName === '.cursorignore') ?? false
    if (hasSkills || hasFastCommands || hasGlobalRuleOutput || hasRules || hasCursorIgnore) return true
    this.log.trace({action: 'skip', reason: 'noOutputs'})
    return false
  }

  override async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {skills, commands, rules} = ctx.collectedInputContext
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

    if (commands != null && commands.length > 0) {
      const filteredCommands = filterCommandsByProjectConfig(commands, projectConfig)
      const commandsDir = this.getGlobalCommandsDir()
      for (const cmd of filteredCommands) fileResults.push(await this.writeGlobalCommand(ctx, commandsDir, cmd))
    }

    const globalRules = rules?.filter(r => this.normalizeRuleScope(r) === 'global')
    if (globalRules == null || globalRules.length === 0) return {files: fileResults, dirs: dirResults}

    const globalRulesDir = path.join(this.getGlobalConfigDir(), RULES_SUBDIR)
    for (const rule of globalRules) fileResults.push(await this.writeRuleMdcFile(ctx, globalRulesDir, rule, this.getGlobalConfigDir()))
    return {files: fileResults, dirs: dirResults}
  }

  override async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
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

  private buildGlobalRuleContent(content: string): string {
    return buildMarkdownWithFrontMatter({description: 'Global prompt (synced)', alwaysApply: true}, content)
  }

  private async writeProjectGlobalRule(ctx: OutputWriteContext, project: {dirFromWorkspacePath?: {path: string, basePath: string} | null}, content: string): Promise<WriteResult> {
    const projectDir = project.dirFromWorkspacePath!
    const rulesDir = path.join(projectDir.basePath, projectDir.path, GLOBAL_CONFIG_DIR, RULES_SUBDIR)
    const fullPath = path.join(rulesDir, GLOBAL_RULE_FILE)

    return this.writeFile(ctx, fullPath, content, 'globalRule')
  }

  private isPreservedSkill(name: string): boolean { return PRESERVED_SKILLS.has(name) }
  private getSkillsCursorDir(): string { return path.join(this.getGlobalConfigDir(), SKILLS_CURSOR_SUBDIR) }
  private getGlobalCommandsDir(): string { return path.join(this.getGlobalConfigDir(), COMMANDS_SUBDIR) }

  private async writeGlobalCommand(ctx: OutputWriteContext, commandsDir: string, cmd: CommandPrompt): Promise<WriteResult> {
    const transformOptions = this.getTransformOptionsFromContext(ctx, {includeSeriesPrefix: true})
    const fileName = this.transformCommandName(cmd, transformOptions)
    const fullPath = path.join(commandsDir, fileName)
    const globalDir = this.getGlobalConfigDir()
    const relativePath = path.join(globalDir, COMMANDS_SUBDIR, fileName)
    const content = this.buildMarkdownContentWithRaw(cmd.content, cmd.yamlFrontMatter, cmd.rawFrontMatter)

    return this.writeFileWithHandling(ctx, fullPath, content, {
      type: 'globalFastCommand',
      relativePath
    })
  }

  private async writeGlobalMcpConfig(ctx: OutputWriteContext, skills: readonly SkillPrompt[]): Promise<WriteResult | null> {
    const mcpManager = new McpConfigManager({fs, logger: this.log})
    const servers = mcpManager.collectMcpServers(skills)

    if (servers.size === 0) return null

    const transformed = mcpManager.transformMcpServers(servers, transformMcpConfigForCursor)

    const globalDir = this.getGlobalConfigDir()
    const mcpConfigPath = path.join(globalDir, MCP_CONFIG_FILE)

    const result = mcpManager.writeCursorMcpConfig(mcpConfigPath, transformed, ctx.dryRun === true)

    return {
      path: path.join(globalDir, MCP_CONFIG_FILE),
      success: result.success,
      ...result.error != null && {error: result.error},
      ...ctx.dryRun && {skipped: true}
    }
  }

  private async writeGlobalSkill(ctx: OutputWriteContext, skillsDir: string, skill: SkillPrompt): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const skillName = skill.yamlFrontMatter.name
    const skillDir = path.join(skillsDir, skillName)
    const skillFilePath = path.join(skillDir, SKILL_FILE_NAME)
    const globalDir = this.getGlobalConfigDir()
    const skillRelativePath = path.join(globalDir, SKILLS_CURSOR_SUBDIR, skillName, SKILL_FILE_NAME)

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
    if (skill.resources != null) { for (const resource of skill.resources) results.push(await this.writeCursorSkillResource(ctx, resource, skillDir, skillName, globalDir)) }
    return results
  }

  private async writeSkillMcpConfig(ctx: OutputWriteContext, skill: SkillPrompt, skillDir: string, globalDir: string): Promise<WriteResult> {
    const skillName = skill.yamlFrontMatter.name
    const mcpConfigPath = path.join(skillDir, MCP_CONFIG_FILE)
    const relativePath = path.join(globalDir, SKILLS_CURSOR_SUBDIR, skillName, MCP_CONFIG_FILE)

    const mcpManager = new McpConfigManager({fs, logger: this.log})
    const result = mcpManager.writeSkillMcpConfig(mcpConfigPath, skill.mcpConfig!.rawContent, ctx.dryRun === true)

    return {
      path: relativePath,
      success: result.success,
      ...result.error != null && {error: result.error},
      ...ctx.dryRun && {skipped: true}
    }
  }

  private async writeSkillChildDoc(ctx: OutputWriteContext, childDoc: {relativePath: string, content: unknown}, skillDir: string, skillName: string, globalDir: string): Promise<WriteResult> {
    const outputRelativePath = childDoc.relativePath.replace(/\.mdx$/, '.md')
    const childDocPath = path.join(skillDir, outputRelativePath)
    const relativePath = path.join(globalDir, SKILLS_CURSOR_SUBDIR, skillName, outputRelativePath)
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

  private async writeCursorSkillResource(ctx: OutputWriteContext, resource: {relativePath: string, content: string, encoding: 'text' | 'base64'}, skillDir: string, skillName: string, globalDir: string): Promise<WriteResult> {
    const resourcePath = path.join(skillDir, resource.relativePath)
    const relativePath = path.join(globalDir, SKILLS_CURSOR_SUBDIR, skillName, resource.relativePath)
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
    const fileName = this.buildRuleFileName(rule)
    const fullPath = path.join(rulesDir, fileName)
    const relativePath = path.join(basePath, GLOBAL_CONFIG_DIR, RULES_SUBDIR, fileName)
    const content = this.buildRuleMdcContent(rule)

    return this.writeFileWithHandling(ctx, fullPath, content, {
      type: 'ruleFile',
      relativePath
    })
  }
}
