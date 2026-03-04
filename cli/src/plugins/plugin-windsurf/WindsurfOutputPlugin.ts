import type {CommandPrompt, OutputPluginContext, OutputWriteContext, RuleContentOptions, RulePrompt, SkillPrompt, WriteResult, WriteResults} from '../plugin-core'
import {Buffer} from 'node:buffer'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {buildMarkdownWithFrontMatter} from '@truenine/md-compiler/markdown'
import {AbstractOutputPlugin, applySubSeriesGlobPrefix, filterByProjectConfig, PLUGIN_NAMES} from '../plugin-core'

const CODEIUM_WINDSURF_DIR = '.codeium/windsurf'
const WORKFLOWS_SUBDIR = 'global_workflows'
const MEMORIES_SUBDIR = 'memories'
const GLOBAL_MEMORY_FILE = 'global_rules.md'
const SKILLS_SUBDIR = 'skills'
const SKILL_FILE_NAME = 'SKILL.md'
const WINDSURF_RULES_DIR = '.windsurf'
const WINDSURF_RULES_SUBDIR = 'rules'
const RULE_FILE_PREFIX = 'rule-'

export class WindsurfOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('WindsurfOutputPlugin', {
      globalConfigDir: CODEIUM_WINDSURF_DIR,
      outputFileName: '',
      dependsOn: [PLUGIN_NAMES.AgentsOutput],
      indexignore: '.codeiumignore'
    })
  }

  override async registerGlobalOutputDirs(ctx: OutputPluginContext): Promise<string[]> {
    const results: string[] = []
    const {commands, skills, rules} = ctx.collectedOutputContext
    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)

    if (commands != null && commands.length > 0) {
      const filteredCommands = filterByProjectConfig(commands, projectConfig, 'commands')
      if (filteredCommands.length > 0) results.push(WORKFLOWS_SUBDIR)
    }

    if (skills != null && skills.length > 0) {
      const filteredSkills = filterByProjectConfig(skills, projectConfig, 'skills')
      for (const skill of filteredSkills) {
        const skillName = skill.yamlFrontMatter.name
        results.push(path.join(SKILLS_SUBDIR, skillName))
      }
    }

    const globalRules = rules?.filter(r => this.normalizeRuleScope(r) === 'global')
    if (globalRules == null || globalRules.length === 0) return results

    results.push(MEMORIES_SUBDIR)
    return results
  }

  override async registerGlobalOutputFiles(ctx: OutputPluginContext): Promise<string[]> {
    const results: string[] = []
    const {skills, commands} = ctx.collectedOutputContext
    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)

    if (commands != null && commands.length > 0) {
      const filteredCommands = filterByProjectConfig(commands, projectConfig, 'commands')
      const transformOptions = this.getTransformOptionsFromContext(ctx, {includeSeriesPrefix: true})
      for (const cmd of filteredCommands) {
        const fileName = this.transformCommandName(cmd, transformOptions)
        results.push(path.join(WORKFLOWS_SUBDIR, fileName))
      }
    }

    const globalRules = ctx.collectedOutputContext.rules?.filter(r => this.normalizeRuleScope(r) === 'global')
    if (globalRules != null && globalRules.length > 0) {
      for (const rule of globalRules) {
        const fileName = this.buildRuleFileName(rule)
        results.push(path.join(MEMORIES_SUBDIR, fileName))
      }
    }

    const filteredSkills = skills != null ? filterByProjectConfig(skills, projectConfig, 'skills') : []
    if (filteredSkills.length === 0) return results

    for (const skill of filteredSkills) {
      const skillName = skill.yamlFrontMatter.name
      results.push(path.join(SKILLS_SUBDIR, skillName, SKILL_FILE_NAME))

      if (skill.childDocs != null) {
        for (const childDoc of skill.childDocs) {
          const outputRelativePath = childDoc.relativePath.replace(/\.mdx$/, '.md')
          results.push(path.join(SKILLS_SUBDIR, skillName, outputRelativePath))
        }
      }

      if (skill.resources != null) {
        for (const resource of skill.resources) results.push(path.join(SKILLS_SUBDIR, skillName, resource.relativePath))
      }
    }
    return results
  }

  override async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {skills, commands, globalMemory, rules, aiAgentIgnoreConfigFiles} = ctx.collectedOutputContext
    const hasSkills = (skills?.length ?? 0) > 0
    const hasCommands = (commands?.length ?? 0) > 0
    const hasRules = (rules?.length ?? 0) > 0
    const hasGlobalMemory = globalMemory != null
    const hasCodeIgnore = aiAgentIgnoreConfigFiles?.some(f => f.fileName === '.codeiumignore') ?? false

    if (hasSkills || hasCommands || hasGlobalMemory || hasRules || hasCodeIgnore) return true

    this.log.trace({action: 'skip', reason: 'noOutputs'})
    return false
  }

  override async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {skills, commands, globalMemory, rules} = ctx.collectedOutputContext
    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    if (globalMemory != null) fileResults.push(await this.writeGlobalMemory(ctx, globalMemory.content as string))

    if (skills != null && skills.length > 0) {
      const filteredSkills = filterByProjectConfig(skills, projectConfig, 'skills')
      const skillsDir = this.getSkillsDir()
      for (const skill of filteredSkills) fileResults.push(...await this.writeGlobalSkill(ctx, skillsDir, skill))
    }

    if (commands != null && commands.length > 0) {
      const filteredCommands = filterByProjectConfig(commands, projectConfig, 'commands')
      const workflowsDir = this.getGlobalWorkflowsDir()
      for (const cmd of filteredCommands) fileResults.push(await this.writeGlobalWorkflow(ctx, workflowsDir, cmd))
    }

    const globalRules = rules?.filter(r => this.normalizeRuleScope(r) === 'global')
    if (globalRules == null || globalRules.length === 0) return {files: fileResults, dirs: dirResults}

    const memoriesDir = this.getGlobalMemoriesDir()
    for (const rule of globalRules) fileResults.push(await this.writeRuleFile(ctx, memoriesDir, rule, this.getCodeiumWindsurfDir(), MEMORIES_SUBDIR))
    return {files: fileResults, dirs: dirResults}
  }

  override async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<string[]> {
    const results: string[] = []
    const {workspace, rules} = ctx.collectedOutputContext
    if (rules == null || rules.length === 0) return results

    for (const project of workspace.projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue
      const projectRules = applySubSeriesGlobPrefix(filterByProjectConfig(rules.filter(r => this.normalizeRuleScope(r) === 'project'), project.projectConfig, 'rules'), project.projectConfig)
      if (projectRules.length === 0) continue
      const rulesDirPath = path.join(projectDir.path, WINDSURF_RULES_DIR, WINDSURF_RULES_SUBDIR)
      results.push(rulesDirPath)
    }
    return results
  }

  override async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<string[]> {
    const results: string[] = []
    const {workspace, rules} = ctx.collectedOutputContext

    if (rules != null && rules.length > 0) {
      for (const project of workspace.projects) {
        const projectDir = project.dirFromWorkspacePath
        if (projectDir == null) continue
        const projectRules = applySubSeriesGlobPrefix(filterByProjectConfig(rules.filter(r => this.normalizeRuleScope(r) === 'project'), project.projectConfig, 'rules'), project.projectConfig)
        for (const rule of projectRules) {
          const fileName = this.buildRuleFileName(rule)
          const filePath = path.join(projectDir.path, WINDSURF_RULES_DIR, WINDSURF_RULES_SUBDIR, fileName)
          results.push(filePath)
        }
      }
    }

    results.push(...this.registerProjectIgnoreOutputFiles(workspace.projects))
    return results
  }

  override async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const fileResults: WriteResult[] = []
    const {workspace, rules} = ctx.collectedOutputContext

    if (rules != null && rules.length > 0) {
      for (const project of workspace.projects) {
        const projectDir = project.dirFromWorkspacePath
        if (projectDir == null) continue
        const projectRules = applySubSeriesGlobPrefix(filterByProjectConfig(rules.filter(r => this.normalizeRuleScope(r) === 'project'), project.projectConfig, 'rules'), project.projectConfig)
        if (projectRules.length === 0) continue
        const rulesDir = path.join(projectDir.basePath, projectDir.path, WINDSURF_RULES_DIR, WINDSURF_RULES_SUBDIR)
        for (const rule of projectRules) fileResults.push(await this.writeRuleFile(ctx, rulesDir, rule, projectDir.basePath, path.join(projectDir.path, WINDSURF_RULES_DIR, WINDSURF_RULES_SUBDIR)))
      }
    }

    fileResults.push(...await this.writeProjectIgnoreFiles(ctx))
    return {files: fileResults, dirs: []}
  }

  private getSkillsDir(): string { return path.join(this.getCodeiumWindsurfDir(), SKILLS_SUBDIR) }
  private getCodeiumWindsurfDir(): string { return path.join(this.getHomeDir(), CODEIUM_WINDSURF_DIR) }
  private getGlobalMemoriesDir(): string { return path.join(this.getCodeiumWindsurfDir(), MEMORIES_SUBDIR) }
  private getGlobalWorkflowsDir(): string { return path.join(this.getCodeiumWindsurfDir(), WORKFLOWS_SUBDIR) }

  private async writeGlobalMemory(ctx: OutputWriteContext, content: string): Promise<WriteResult> {
    const memoriesDir = this.getGlobalMemoriesDir()
    const fullPath = path.join(memoriesDir, GLOBAL_MEMORY_FILE)
    const relativePath = path.join(MEMORIES_SUBDIR, GLOBAL_MEMORY_FILE)

    if (ctx.dryRun === true) { this.log.trace({action: 'dryRun', type: 'globalMemory', path: fullPath}); return {path: relativePath, success: true, skipped: false} }

    try {
      this.ensureDirectory(memoriesDir)
      this.writeFileSync(fullPath, content)
      this.log.trace({action: 'write', type: 'globalMemory', path: fullPath})
      return {path: relativePath, success: true}
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'globalMemory', path: fullPath, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
  }

  private async writeGlobalWorkflow(ctx: OutputWriteContext, workflowsDir: string, cmd: CommandPrompt): Promise<WriteResult> {
    const transformOptions = this.getTransformOptionsFromContext(ctx, {includeSeriesPrefix: true})
    const fileName = this.transformCommandName(cmd, transformOptions)
    const fullPath = path.join(workflowsDir, fileName)
    const relativePath = path.join(WORKFLOWS_SUBDIR, fileName)
    const content = this.buildMarkdownContentWithRaw(cmd.content, cmd.yamlFrontMatter, cmd.rawFrontMatter)

    if (ctx.dryRun === true) { this.log.trace({action: 'dryRun', type: 'globalWorkflow', path: fullPath}); return {path: relativePath, success: true, skipped: false} }

    try {
      this.ensureDirectory(workflowsDir)
      fs.writeFileSync(fullPath, content)
      this.log.trace({action: 'write', type: 'globalWorkflow', path: fullPath})
      return {path: relativePath, success: true}
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'globalWorkflow', path: fullPath, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
  }

  private async writeGlobalSkill(ctx: OutputWriteContext, skillsDir: string, skill: SkillPrompt): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const skillName = skill.yamlFrontMatter.name
    const skillDir = path.join(skillsDir, skillName)
    const skillFilePath = path.join(skillDir, SKILL_FILE_NAME)
    const skillRelativePath = path.join(SKILLS_SUBDIR, skillName, SKILL_FILE_NAME)

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

    if (skill.childDocs != null) {
      for (const childDoc of skill.childDocs) results.push(await this.writeSkillChildDoc(ctx, childDoc, skillDir, skillName))
    }

    if (skill.resources != null) {
      for (const resource of skill.resources) results.push(await this.writeWindsurfSkillResource(ctx, resource, skillDir, skillName))
    }

    return results
  }

  private async writeSkillChildDoc(ctx: OutputWriteContext, childDoc: {relativePath: string, content: unknown}, skillDir: string, skillName: string): Promise<WriteResult> {
    const outputRelativePath = childDoc.relativePath.replace(/\.mdx$/, '.md')
    const childDocPath = path.join(skillDir, outputRelativePath)
    const relativePath = path.join(SKILLS_SUBDIR, skillName, outputRelativePath)
    const content = childDoc.content as string

    if (ctx.dryRun === true) { this.log.trace({action: 'dryRun', type: 'childDoc', path: childDocPath}); return {path: relativePath, success: true, skipped: false} }

    try {
      this.ensureDirectory(path.dirname(childDocPath))
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

  private async writeWindsurfSkillResource(ctx: OutputWriteContext, resource: {relativePath: string, content: string, encoding: 'text' | 'base64'}, skillDir: string, skillName: string): Promise<WriteResult> {
    const resourcePath = path.join(skillDir, resource.relativePath)
    const relativePath = path.join(SKILLS_SUBDIR, skillName, resource.relativePath)

    if (ctx.dryRun === true) { this.log.trace({action: 'dryRun', type: 'resource', path: resourcePath}); return {path: relativePath, success: true, skipped: false} }

    try {
      this.ensureDirectory(path.dirname(resourcePath))
      if (resource.encoding === 'base64') this.writeFileSyncBuffer(resourcePath, Buffer.from(resource.content, 'base64'))
      else this.writeFileSync(resourcePath, resource.content)
      this.log.trace({action: 'write', type: 'resource', path: resourcePath})
      return {path: relativePath, success: true}
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'resource', path: resourcePath, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
  }

  protected override buildRuleFileName(rule: RulePrompt, prefix: string = RULE_FILE_PREFIX): string {
    return `${prefix}${rule.prefix}-${rule.ruleName}.md`
  }

  protected override buildRuleContent(rule: RulePrompt, _options?: RuleContentOptions): string {
    const fmData: Record<string, unknown> = {trigger: 'glob', globs: rule.globs.length > 0 ? rule.globs.join(', ') : ''}
    const raw = buildMarkdownWithFrontMatter(fmData, rule.content)
    const lines = raw.split('\n')
    return lines.map(line => {
      const match = /^(\s*globs:\s*)(['"])(.*)\2\s*$/.exec(line)
      if (match == null) return line
      const prefix = match[1] ?? 'globs: '
      const value = match[3] ?? ''
      if (value.trim().length === 0) return line
      return `${prefix}${value}`
    }).join('\n')
  }

  private async writeRuleFile(ctx: OutputWriteContext, rulesDir: string, rule: RulePrompt, _basePath: string, relativeSubdir: string): Promise<WriteResult> {
    const fileName = this.buildRuleFileName(rule)
    const fullPath = path.join(rulesDir, fileName)
    const relativePath = path.join(relativeSubdir, fileName)
    const content = this.buildRuleContent(rule)

    if (ctx.dryRun === true) { this.log.trace({action: 'dryRun', type: 'ruleFile', path: fullPath}); return {path: relativePath, success: true, skipped: false} }

    try {
      this.ensureDirectory(rulesDir)
      this.writeFileSync(fullPath, content)
      this.log.trace({action: 'write', type: 'ruleFile', path: fullPath})
      return {path: relativePath, success: true}
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'ruleFile', path: fullPath, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
  }
}
