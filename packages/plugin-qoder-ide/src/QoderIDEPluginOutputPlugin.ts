import type {
  FastCommandPrompt,
  OutputPluginContext,
  OutputWriteContext,
  ProjectChildrenMemoryPrompt,
  RulePrompt,
  SkillPrompt,
  WriteResult,
  WriteResults
} from '@truenine/plugin-shared'
import type {RelativePath} from '@truenine/plugin-shared/types'
import {Buffer} from 'node:buffer'
import * as path from 'node:path'
import {buildMarkdownWithFrontMatter} from '@truenine/md-compiler/markdown'
import {AbstractOutputPlugin} from '@truenine/plugin-output-shared'
import {applySubSeriesGlobPrefix, filterRulesByProjectConfig} from '@truenine/plugin-output-shared/utils'

const QODER_CONFIG_DIR = '.qoder'
const RULES_SUBDIR = 'rules'
const COMMANDS_SUBDIR = 'commands'
const SKILLS_SUBDIR = 'skills'
const GLOBAL_RULE_FILE = 'global.md'
const PROJECT_RULE_FILE = 'always.md'
const CHILD_RULE_FILE_PREFIX = 'glob-'
const SKILL_FILE_NAME = 'SKILL.md'
const MCP_CONFIG_FILE = 'mcp.json'
const TRIGGER_ALWAYS = 'always_on'
const TRIGGER_GLOB = 'glob'
const RULE_GLOB_KEY = 'glob'
const RULE_FILE_PREFIX = 'rule-'

export class QoderIDEPluginOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('QoderIDEPluginOutputPlugin', {globalConfigDir: QODER_CONFIG_DIR, indexignore: '.qoderignore'})
  }

  async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const {projects} = ctx.collectedInputContext.workspace
    return projects
      .filter(p => p.dirFromWorkspacePath != null)
      .map(p => this.createProjectRulesDirPath(p.dirFromWorkspacePath!))
  }

  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {workspace, rules} = ctx.collectedInputContext
    const {projects} = workspace
    const {globalMemory} = ctx.collectedInputContext

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue

      if (globalMemory != null) results.push(this.createProjectRuleFilePath(projectDir, GLOBAL_RULE_FILE))

      if (project.rootMemoryPrompt != null) results.push(this.createProjectRuleFilePath(projectDir, PROJECT_RULE_FILE))

      if (project.childMemoryPrompts != null) {
        for (const child of project.childMemoryPrompts) results.push(this.createProjectRuleFilePath(projectDir, this.buildChildRuleFileName(child)))
      }

      if (rules != null && rules.length > 0) { // Handle project rules
        const projectRules = applySubSeriesGlobPrefix(
          filterRulesByProjectConfig(
            rules.filter(r => this.normalizeRuleScope(r) === 'project'),
            project.projectConfig
          ),
          project.projectConfig
        )
        for (const rule of projectRules) {
          const fileName = this.buildRuleFileName(rule)
          results.push(this.createProjectRuleFilePath(projectDir, fileName))
        }
      }
    }
    results.push(...this.registerProjectIgnoreOutputFiles(projects))
    return results
  }

  async registerGlobalOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const globalDir = this.getGlobalConfigDir()
    const {fastCommands, skills, rules} = ctx.collectedInputContext
    const results: RelativePath[] = []

    if (fastCommands != null && fastCommands.length > 0) results.push(this.createRelativePath(COMMANDS_SUBDIR, globalDir, () => COMMANDS_SUBDIR))

    if (skills != null && skills.length > 0) {
      for (const skill of skills) {
        const skillName = skill.yamlFrontMatter.name
        results.push(this.createRelativePath(
          path.join(SKILLS_SUBDIR, skillName),
          globalDir,
          () => skillName
        ))
      }
    }

    const globalRules = rules?.filter(r => this.normalizeRuleScope(r) === 'global')
    if (globalRules != null && globalRules.length > 0) {
      results.push(this.createRelativePath(
        path.join(RULES_SUBDIR),
        globalDir,
        () => RULES_SUBDIR
      ))
    }
    return results
  }

  async registerGlobalOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const globalDir = this.getGlobalConfigDir()
    const {fastCommands, skills, rules} = ctx.collectedInputContext
    const results: RelativePath[] = []
    const transformOptions = this.getTransformOptionsFromContext(ctx, {includeSeriesPrefix: true})

    if (fastCommands != null && fastCommands.length > 0) {
      for (const cmd of fastCommands) {
        const fileName = this.transformFastCommandName(cmd, transformOptions)
        results.push(this.createRelativePath(
          path.join(COMMANDS_SUBDIR, fileName),
          globalDir,
          () => COMMANDS_SUBDIR
        ))
      }
    }

    const globalRules = rules?.filter(r => this.normalizeRuleScope(r) === 'global')
    if (globalRules != null && globalRules.length > 0) {
      for (const rule of globalRules) {
        const fileName = this.buildRuleFileName(rule)
        results.push(this.createRelativePath(
          path.join(RULES_SUBDIR, fileName),
          globalDir,
          () => RULES_SUBDIR
        ))
      }
    }

    if (skills != null && skills.length > 0) {
      for (const skill of skills) {
        const skillName = skill.yamlFrontMatter.name
        results.push(this.createRelativePath(
          path.join(SKILLS_SUBDIR, skillName, SKILL_FILE_NAME),
          globalDir,
          () => skillName
        ))

        if (skill.mcpConfig != null) {
          results.push(this.createRelativePath(
            path.join(SKILLS_SUBDIR, skillName, MCP_CONFIG_FILE),
            globalDir,
            () => skillName
          ))
        }

        if (skill.childDocs != null) {
          for (const childDoc of skill.childDocs) {
            results.push(this.createRelativePath(
              path.join(SKILLS_SUBDIR, skillName, childDoc.relativePath.replace(/\.mdx$/, '.md')),
              globalDir,
              () => skillName
            ))
          }
        }

        if (skill.resources != null) {
          for (const resource of skill.resources) {
            results.push(this.createRelativePath(
              path.join(SKILLS_SUBDIR, skillName, resource.relativePath),
              globalDir,
              () => skillName
            ))
          }
        }
      }
    }
    return results
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {workspace, globalMemory, fastCommands, skills, rules, aiAgentIgnoreConfigFiles} = ctx.collectedInputContext
    const hasProjectPrompts = workspace.projects.some(
      p => p.rootMemoryPrompt != null || (p.childMemoryPrompts?.length ?? 0) > 0
    )
    const hasRules = (rules?.length ?? 0) > 0
    const hasQoderIgnore = aiAgentIgnoreConfigFiles?.some(f => f.fileName === '.qoderignore') ?? false
    if (hasProjectPrompts || globalMemory != null || (fastCommands?.length ?? 0) > 0 || (skills?.length ?? 0) > 0 || hasRules || hasQoderIgnore) return true
    this.log.trace({action: 'skip', reason: 'noOutputs'})
    return false
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {workspace, globalMemory, rules} = ctx.collectedInputContext
    const {projects} = workspace
    const fileResults: WriteResult[] = []

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) continue
      const projectDir = project.dirFromWorkspacePath

      if (globalMemory != null) {
        const content = this.buildAlwaysRuleContent(globalMemory.content as string)
        fileResults.push(await this.writeProjectRuleFile(ctx, projectDir, GLOBAL_RULE_FILE, content, 'globalRule'))
      }

      if (project.rootMemoryPrompt != null) {
        const content = this.buildAlwaysRuleContent(project.rootMemoryPrompt.content as string)
        fileResults.push(await this.writeProjectRuleFile(ctx, projectDir, PROJECT_RULE_FILE, content, 'projectRootRule'))
      }

      if (project.childMemoryPrompts != null) {
        for (const child of project.childMemoryPrompts) {
          const fileName = this.buildChildRuleFileName(child)
          const content = this.buildGlobRuleContent(child)
          fileResults.push(await this.writeProjectRuleFile(ctx, projectDir, fileName, content, 'projectChildRule'))
        }
      }

      if (rules != null && rules.length > 0) { // Write project rules
        const projectRules = applySubSeriesGlobPrefix(
          filterRulesByProjectConfig(
            rules.filter(r => this.normalizeRuleScope(r) === 'project'),
            project.projectConfig
          ),
          project.projectConfig
        )
        for (const rule of projectRules) {
          const fileName = this.buildRuleFileName(rule)
          const content = this.buildRuleContent(rule)
          fileResults.push(await this.writeProjectRuleFile(ctx, projectDir, fileName, content, 'projectRule'))
        }
      }
    }
    const ignoreResults = await this.writeProjectIgnoreFiles(ctx)
    fileResults.push(...ignoreResults)
    return {files: fileResults, dirs: []}
  }

  async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {fastCommands, skills, rules} = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const globalDir = this.getGlobalConfigDir()
    const commandsDir = path.join(globalDir, COMMANDS_SUBDIR)
    const skillsDir = path.join(globalDir, SKILLS_SUBDIR)
    const rulesDir = path.join(globalDir, RULES_SUBDIR)

    if (fastCommands != null && fastCommands.length > 0) {
      for (const cmd of fastCommands) fileResults.push(await this.writeGlobalFastCommand(ctx, commandsDir, cmd))
    }

    if (rules != null && rules.length > 0) {
      const globalRules = rules.filter(r => this.normalizeRuleScope(r) === 'global')
      for (const rule of globalRules) fileResults.push(await this.writeRuleFile(ctx, rulesDir, rule))
    }

    if (skills != null && skills.length > 0) {
      for (const skill of skills) fileResults.push(...await this.writeGlobalSkill(ctx, skillsDir, skill))
    }
    return {files: fileResults, dirs: []}
  }

  private createProjectRulesDirPath(projectDir: RelativePath): RelativePath {
    return this.createRelativePath(
      path.join(projectDir.path, QODER_CONFIG_DIR, RULES_SUBDIR),
      projectDir.basePath,
      () => RULES_SUBDIR
    )
  }

  private createProjectRuleFilePath(projectDir: RelativePath, fileName: string): RelativePath {
    return this.createRelativePath(
      path.join(projectDir.path, QODER_CONFIG_DIR, RULES_SUBDIR, fileName),
      projectDir.basePath,
      () => RULES_SUBDIR
    )
  }

  private buildChildRuleFileName(child: ProjectChildrenMemoryPrompt): string {
    const childPath = child.workingChildDirectoryPath?.path ?? child.dir.path
    const normalized = childPath.replaceAll('\\', '/').replaceAll(/^\/+|\/+$/g, '').replaceAll('/', '-')
    return `${CHILD_RULE_FILE_PREFIX}${normalized.length > 0 ? normalized : 'root'}.md`
  }

  private buildAlwaysRuleContent(content: string): string {
    return buildMarkdownWithFrontMatter({trigger: TRIGGER_ALWAYS, type: 'user_command'}, content)
  }

  private buildGlobRuleContent(child: ProjectChildrenMemoryPrompt): string {
    const childPath = child.workingChildDirectoryPath?.path ?? child.dir.path
    const normalized = childPath.replaceAll('\\', '/').replaceAll(/^\/+|\/+$/g, '')
    const pattern = normalized.length === 0 ? '**/*' : `${normalized}/**`
    return buildMarkdownWithFrontMatter({trigger: TRIGGER_GLOB, [RULE_GLOB_KEY]: pattern, type: 'user_command'}, child.content as string)
  }

  private async writeProjectRuleFile(
    ctx: OutputWriteContext,
    projectDir: RelativePath,
    fileName: string,
    content: string,
    label: string
  ): Promise<WriteResult> {
    const rulesDir = path.join(projectDir.basePath, projectDir.path, QODER_CONFIG_DIR, RULES_SUBDIR)
    const fullPath = path.join(rulesDir, fileName)
    return this.writeFile(ctx, fullPath, content, label)
  }

  private async writeGlobalFastCommand(
    ctx: OutputWriteContext,
    commandsDir: string,
    cmd: FastCommandPrompt
  ): Promise<WriteResult> {
    const transformOptions = this.getTransformOptionsFromContext(ctx, {includeSeriesPrefix: true})
    const fileName = this.transformFastCommandName(cmd, transformOptions)
    const fullPath = path.join(commandsDir, fileName)
    const fmData = this.buildFastCommandFrontMatter(cmd)
    const content = buildMarkdownWithFrontMatter(fmData, cmd.content)
    return this.writeFile(ctx, fullPath, content, 'globalFastCommand')
  }

  private async writeRuleFile(
    ctx: OutputWriteContext,
    rulesDir: string,
    rule: RulePrompt
  ): Promise<WriteResult> {
    const fileName = this.buildRuleFileName(rule)
    const fullPath = path.join(rulesDir, fileName)
    const content = this.buildRuleContent(rule)
    return this.writeFile(ctx, fullPath, content, 'rule')
  }

  private async writeGlobalSkill(
    ctx: OutputWriteContext,
    skillsDir: string,
    skill: SkillPrompt
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const skillName = skill.yamlFrontMatter.name
    const skillDir = path.join(skillsDir, skillName)
    const skillFilePath = path.join(skillDir, SKILL_FILE_NAME)

    const fmData = this.buildSkillFrontMatter(skill)
    const content = buildMarkdownWithFrontMatter(fmData, skill.content as string)
    results.push(await this.writeFile(ctx, skillFilePath, content, 'skill'))

    if (skill.mcpConfig != null) {
      const mcpPath = path.join(skillDir, MCP_CONFIG_FILE)
      results.push(await this.writeFile(ctx, mcpPath, skill.mcpConfig.rawContent, 'mcpConfig'))
    }

    if (skill.childDocs != null) {
      for (const childDoc of skill.childDocs) {
        const childPath = path.join(skillDir, childDoc.relativePath.replace(/\.mdx$/, '.md'))
        results.push(await this.writeFile(ctx, childPath, childDoc.content as string, 'childDoc'))
      }
    }

    if (skill.resources != null) {
      for (const resource of skill.resources) {
        const resourcePath = path.join(skillDir, resource.relativePath)
        if (resource.encoding === 'base64') {
          const buffer = Buffer.from(resource.content, 'base64')
          const dir = path.dirname(resourcePath)
          this.ensureDirectory(dir)
          this.writeFileSyncBuffer(resourcePath, buffer)
          results.push({
            path: this.createRelativePath(resource.relativePath, skillDir, () => skillName),
            success: true
          })
        } else results.push(await this.writeFile(ctx, resourcePath, resource.content, 'resource'))
      }
    }
    return results
  }

  private buildSkillFrontMatter(skill: SkillPrompt): Record<string, unknown> {
    const fm = skill.yamlFrontMatter
    return {
      name: fm.name,
      description: fm.description,
      type: 'user_command',
      ...fm.displayName != null && {displayName: fm.displayName},
      ...fm.keywords != null && fm.keywords.length > 0 && {keywords: fm.keywords},
      ...fm.author != null && {author: fm.author},
      ...fm.version != null && {version: fm.version},
      ...fm.allowTools != null && fm.allowTools.length > 0 && {allowTools: fm.allowTools}
    }
  }

  private buildFastCommandFrontMatter(cmd: FastCommandPrompt): Record<string, unknown> {
    const fm = cmd.yamlFrontMatter
    if (fm == null) return {description: 'Fast command', type: 'user_command'}
    return {
      description: fm.description,
      type: 'user_command',
      ...fm.argumentHint != null && {argumentHint: fm.argumentHint},
      ...fm.allowTools != null && fm.allowTools.length > 0 && {allowTools: fm.allowTools}
    }
  }

  private buildRuleFileName(rule: RulePrompt): string {
    return `${RULE_FILE_PREFIX}${rule.series}-${rule.ruleName}.md`
  }

  private buildRuleContent(rule: RulePrompt): string {
    const fmData: Record<string, unknown> = {
      trigger: TRIGGER_GLOB,
      [RULE_GLOB_KEY]: rule.globs.length > 0 ? rule.globs.join(', ') : '**/*',
      type: 'user_command'
    }
    return buildMarkdownWithFrontMatter(fmData, rule.content)
  }

  protected override normalizeRuleScope(rule: RulePrompt): 'global' | 'project' {
    return rule.scope || 'global'
  }
}
