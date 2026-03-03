import type {RuleContentOptions} from '@truenine/plugin-output-shared'
import type {
  CommandPrompt,
  OutputPluginContext,
  OutputWriteContext,
  RulePrompt,
  SkillPrompt,
  WriteResult,
  WriteResults
} from '../plugin-shared'
import type {RelativePath} from '../plugin-shared/types'
import {Buffer} from 'node:buffer'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {buildMarkdownWithFrontMatter} from '@truenine/md-compiler/markdown'
import {AbstractOutputPlugin, applySubSeriesGlobPrefix, filterCommandsByProjectConfig, filterRulesByProjectConfig, filterSkillsByProjectConfig} from '@truenine/plugin-output-shared'
import {FilePathKind, PLUGIN_NAMES} from '../plugin-shared'

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

  async registerGlobalOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {commands, skills, rules} = ctx.collectedInputContext
    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)

    if (commands != null && commands.length > 0) {
      const filteredCommands = filterCommandsByProjectConfig(commands, projectConfig)
      if (filteredCommands.length > 0) {
        const workflowsDir = this.getGlobalWorkflowsDir()
        results.push({pathKind: FilePathKind.Relative, path: WORKFLOWS_SUBDIR, basePath: this.getCodeiumWindsurfDir(), getDirectoryName: () => WORKFLOWS_SUBDIR, getAbsolutePath: () => workflowsDir})
      }
    }

    if (skills != null && skills.length > 0) {
      const filteredSkills = filterSkillsByProjectConfig(skills, projectConfig)
      for (const skill of filteredSkills) {
        const skillName = skill.yamlFrontMatter.name
        const skillPath = path.join(this.getCodeiumWindsurfDir(), SKILLS_SUBDIR, skillName)
        results.push({pathKind: FilePathKind.Relative, path: path.join(SKILLS_SUBDIR, skillName), basePath: this.getCodeiumWindsurfDir(), getDirectoryName: () => skillName, getAbsolutePath: () => skillPath})
      }
    }

    const globalRules = rules?.filter(r => this.normalizeRuleScope(r) === 'global')
    if (globalRules == null || globalRules.length === 0) return results

    const codeiumDir = this.getCodeiumWindsurfDir()
    const memoriesDir = path.join(codeiumDir, MEMORIES_SUBDIR)
    results.push({pathKind: FilePathKind.Relative, path: MEMORIES_SUBDIR, basePath: codeiumDir, getDirectoryName: () => MEMORIES_SUBDIR, getAbsolutePath: () => memoriesDir})
    return results
  }

  async registerGlobalOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {skills, commands} = ctx.collectedInputContext
    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)

    if (commands != null && commands.length > 0) {
      const filteredCommands = filterCommandsByProjectConfig(commands, projectConfig)
      const workflowsDir = this.getGlobalWorkflowsDir()
      const transformOptions = this.getTransformOptionsFromContext(ctx, {includeSeriesPrefix: true})
      for (const cmd of filteredCommands) {
        const fileName = this.transformCommandName(cmd, transformOptions)
        const fullPath = path.join(workflowsDir, fileName)
        results.push({pathKind: FilePathKind.Relative, path: path.join(WORKFLOWS_SUBDIR, fileName), basePath: this.getCodeiumWindsurfDir(), getDirectoryName: () => WORKFLOWS_SUBDIR, getAbsolutePath: () => fullPath})
      }
    }

    const globalRules = ctx.collectedInputContext.rules?.filter(r => this.normalizeRuleScope(r) === 'global')
    if (globalRules != null && globalRules.length > 0) {
      const codeiumDir = this.getCodeiumWindsurfDir()
      const memoriesDir = path.join(codeiumDir, MEMORIES_SUBDIR)
      for (const rule of globalRules) {
        const fileName = this.buildRuleFileName(rule)
        const fullPath = path.join(memoriesDir, fileName)
        results.push({pathKind: FilePathKind.Relative, path: path.join(MEMORIES_SUBDIR, fileName), basePath: codeiumDir, getDirectoryName: () => MEMORIES_SUBDIR, getAbsolutePath: () => fullPath})
      }
    }

    const filteredSkills = skills != null ? filterSkillsByProjectConfig(skills, projectConfig) : []
    if (filteredSkills.length === 0) return results

    const skillsDir = this.getSkillsDir()
    const codeiumDir = this.getCodeiumWindsurfDir()
    for (const skill of filteredSkills) {
      const skillName = skill.yamlFrontMatter.name
      const skillDir = path.join(skillsDir, skillName)
      results.push({pathKind: FilePathKind.Relative, path: path.join(SKILLS_SUBDIR, skillName, SKILL_FILE_NAME), basePath: codeiumDir, getDirectoryName: () => skillName, getAbsolutePath: () => path.join(skillDir, SKILL_FILE_NAME)})

      if (skill.childDocs != null) {
        for (const childDoc of skill.childDocs) {
          const outputRelativePath = childDoc.relativePath.replace(/\.mdx$/, '.md')
          results.push({pathKind: FilePathKind.Relative, path: path.join(SKILLS_SUBDIR, skillName, outputRelativePath), basePath: codeiumDir, getDirectoryName: () => skillName, getAbsolutePath: () => path.join(skillDir, outputRelativePath)})
        }
      }

      if (skill.resources != null) {
        for (const resource of skill.resources) results.push({pathKind: FilePathKind.Relative, path: path.join(SKILLS_SUBDIR, skillName, resource.relativePath), basePath: codeiumDir, getDirectoryName: () => skillName, getAbsolutePath: () => path.join(skillDir, resource.relativePath)})
      }
    }
    return results
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {skills, commands, globalMemory, rules, aiAgentIgnoreConfigFiles} = ctx.collectedInputContext
    const hasSkills = (skills?.length ?? 0) > 0
    const hasCommands = (commands?.length ?? 0) > 0
    const hasRules = (rules?.length ?? 0) > 0
    const hasGlobalMemory = globalMemory != null
    const hasCodeIgnore = aiAgentIgnoreConfigFiles?.some(f => f.fileName === '.codeiumignore') ?? false

    if (hasSkills || hasCommands || hasGlobalMemory || hasRules || hasCodeIgnore) return true

    this.log.trace({action: 'skip', reason: 'noOutputs'})
    return false
  }

  async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {skills, commands, globalMemory, rules} = ctx.collectedInputContext
    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    if (globalMemory != null) fileResults.push(await this.writeGlobalMemory(ctx, globalMemory.content as string))

    if (skills != null && skills.length > 0) {
      const filteredSkills = filterSkillsByProjectConfig(skills, projectConfig)
      const skillsDir = this.getSkillsDir()
      for (const skill of filteredSkills) fileResults.push(...await this.writeGlobalSkill(ctx, skillsDir, skill))
    }

    if (commands != null && commands.length > 0) {
      const filteredCommands = filterCommandsByProjectConfig(commands, projectConfig)
      const workflowsDir = this.getGlobalWorkflowsDir()
      for (const cmd of filteredCommands) fileResults.push(await this.writeGlobalWorkflow(ctx, workflowsDir, cmd))
    }

    const globalRules = rules?.filter(r => this.normalizeRuleScope(r) === 'global')
    if (globalRules == null || globalRules.length === 0) return {files: fileResults, dirs: dirResults}

    const memoriesDir = this.getGlobalMemoriesDir()
    for (const rule of globalRules) fileResults.push(await this.writeRuleFile(ctx, memoriesDir, rule, this.getCodeiumWindsurfDir(), MEMORIES_SUBDIR))
    return {files: fileResults, dirs: dirResults}
  }

  async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {workspace, rules} = ctx.collectedInputContext
    if (rules == null || rules.length === 0) return results

    for (const project of workspace.projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue
      const projectRules = applySubSeriesGlobPrefix(filterRulesByProjectConfig(rules.filter(r => this.normalizeRuleScope(r) === 'project'), project.projectConfig), project.projectConfig)
      if (projectRules.length === 0) continue
      const rulesDirPath = path.join(projectDir.path, WINDSURF_RULES_DIR, WINDSURF_RULES_SUBDIR)
      results.push({pathKind: FilePathKind.Relative, path: rulesDirPath, basePath: projectDir.basePath, getDirectoryName: () => WINDSURF_RULES_SUBDIR, getAbsolutePath: () => path.join(projectDir.basePath, rulesDirPath)})
    }
    return results
  }

  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {workspace, rules} = ctx.collectedInputContext

    if (rules != null && rules.length > 0) {
      for (const project of workspace.projects) {
        const projectDir = project.dirFromWorkspacePath
        if (projectDir == null) continue
        const projectRules = applySubSeriesGlobPrefix(filterRulesByProjectConfig(rules.filter(r => this.normalizeRuleScope(r) === 'project'), project.projectConfig), project.projectConfig)
        for (const rule of projectRules) {
          const fileName = this.buildRuleFileName(rule)
          const filePath = path.join(projectDir.path, WINDSURF_RULES_DIR, WINDSURF_RULES_SUBDIR, fileName)
          results.push({pathKind: FilePathKind.Relative, path: filePath, basePath: projectDir.basePath, getDirectoryName: () => WINDSURF_RULES_SUBDIR, getAbsolutePath: () => path.join(projectDir.basePath, filePath)})
        }
      }
    }

    results.push(...this.registerProjectIgnoreOutputFiles(workspace.projects))
    return results
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const fileResults: WriteResult[] = []
    const {workspace, rules} = ctx.collectedInputContext

    if (rules != null && rules.length > 0) {
      for (const project of workspace.projects) {
        const projectDir = project.dirFromWorkspacePath
        if (projectDir == null) continue
        const projectRules = applySubSeriesGlobPrefix(filterRulesByProjectConfig(rules.filter(r => this.normalizeRuleScope(r) === 'project'), project.projectConfig), project.projectConfig)
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
    const codeiumDir = this.getCodeiumWindsurfDir()
    const relativePath: RelativePath = {pathKind: FilePathKind.Relative, path: path.join(MEMORIES_SUBDIR, GLOBAL_MEMORY_FILE), basePath: codeiumDir, getDirectoryName: () => MEMORIES_SUBDIR, getAbsolutePath: () => fullPath}

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
    const relativePath: RelativePath = {pathKind: FilePathKind.Relative, path: path.join(WORKFLOWS_SUBDIR, fileName), basePath: this.getCodeiumWindsurfDir(), getDirectoryName: () => WORKFLOWS_SUBDIR, getAbsolutePath: () => fullPath}
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
    const codeiumDir = this.getCodeiumWindsurfDir()
    const skillRelativePath: RelativePath = {pathKind: FilePathKind.Relative, path: path.join(SKILLS_SUBDIR, skillName, SKILL_FILE_NAME), basePath: codeiumDir, getDirectoryName: () => skillName, getAbsolutePath: () => skillFilePath}

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
      for (const childDoc of skill.childDocs) results.push(await this.writeSkillChildDoc(ctx, childDoc, skillDir, skillName, codeiumDir))
    }

    if (skill.resources != null) {
      for (const resource of skill.resources) results.push(await this.writeSkillResource(ctx, resource, skillDir, skillName, codeiumDir))
    }

    return results
  }

  private async writeSkillChildDoc(ctx: OutputWriteContext, childDoc: {relativePath: string, content: unknown}, skillDir: string, skillName: string, baseDir: string): Promise<WriteResult> {
    const outputRelativePath = childDoc.relativePath.replace(/\.mdx$/, '.md')
    const childDocPath = path.join(skillDir, outputRelativePath)
    const relativePath: RelativePath = {pathKind: FilePathKind.Relative, path: path.join(SKILLS_SUBDIR, skillName, outputRelativePath), basePath: baseDir, getDirectoryName: () => skillName, getAbsolutePath: () => childDocPath}
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

  private async writeSkillResource(ctx: OutputWriteContext, resource: {relativePath: string, content: string, encoding: 'text' | 'base64'}, skillDir: string, skillName: string, baseDir: string): Promise<WriteResult> {
    const resourcePath = path.join(skillDir, resource.relativePath)
    const relativePath: RelativePath = {pathKind: FilePathKind.Relative, path: path.join(SKILLS_SUBDIR, skillName, resource.relativePath), basePath: baseDir, getDirectoryName: () => skillName, getAbsolutePath: () => resourcePath}

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
    return `${prefix}${rule.series}-${rule.ruleName}.md`
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

  private async writeRuleFile(ctx: OutputWriteContext, rulesDir: string, rule: RulePrompt, basePath: string, relativeSubdir: string): Promise<WriteResult> {
    const fileName = this.buildRuleFileName(rule)
    const fullPath = path.join(rulesDir, fileName)
    const relativePath: RelativePath = {pathKind: FilePathKind.Relative, path: path.join(relativeSubdir, fileName), basePath, getDirectoryName: () => WINDSURF_RULES_SUBDIR, getAbsolutePath: () => fullPath}
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
