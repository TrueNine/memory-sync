import type {
  FastCommandPrompt,
  OutputPluginContext,
  OutputWriteContext,
  Project,
  SkillPrompt,
  WriteResult,
  WriteResults
} from '@/types'
import type {RelativePath} from '@/types/FileSystemTypes'
import {Buffer} from 'node:buffer'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {buildMarkdownWithFrontMatter} from '@/markdown'
import {FilePathKind} from '@/types'
import {AbstractOutputPlugin} from './AbstractOutputPlugin'

const GLOBAL_CONFIG_DIR = '.cursor'
const MCP_CONFIG_FILE = 'mcp.json'
const COMMANDS_SUBDIR = 'commands'
const RULES_SUBDIR = 'rules'
const GLOBAL_RULE_FILE = 'global.mdc'
const SKILLS_CURSOR_SUBDIR = 'skills-cursor'
const SKILL_FILE_NAME = 'SKILL.md'

const PRESERVED_SKILLS = new Set<string>([
  'create-rule',
  'create-skill',
  'create-subagent',
  'migrate-to-skills',
  'update-cursor-settings'
])

/**
 * Cursor IDE output plugin.
 * Depends on AgentsOutputPlugin so that AGENTS.md is generated before this plugin runs.
 * Writes merged MCP config from skills to ~/.cursor/mcp.json (Cursor global MCP config).
 * Writes fast commands to ~/.cursor/commands/.
 * Writes skills to ~/.cursor/skills-cursor/ (preserves built-in skills: create-rule, create-skill, etc.).
 * Writes global prompt to each project's .cursor/rules/global.mdc with alwaysApply: true (Cursor has no global prompt setting).
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

  async registerGlobalOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const globalDir = this.getGlobalConfigDir()
    const {fastCommands, skills} = ctx.collectedInputContext

    if (fastCommands != null && fastCommands.length > 0) {
      const commandsDir = this.getGlobalCommandsDir()
      results.push({
        pathKind: FilePathKind.Relative,
        path: COMMANDS_SUBDIR,
        basePath: globalDir,
        getDirectoryName: () => COMMANDS_SUBDIR,
        getAbsolutePath: () => commandsDir
      })
    }

    if (skills != null && skills.length > 0) {
      for (const skill of skills) {
        const skillName = skill.yamlFrontMatter.name
        if (this.isPreservedSkill(skillName)) continue

        const skillPath = path.join(globalDir, SKILLS_CURSOR_SUBDIR, skillName)
        results.push({
          pathKind: FilePathKind.Relative,
          path: path.join(SKILLS_CURSOR_SUBDIR, skillName),
          basePath: globalDir,
          getDirectoryName: () => skillName,
          getAbsolutePath: () => skillPath
        })
      }
    }

    return results
  }

  async registerGlobalOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const globalDir = this.getGlobalConfigDir()
    const {skills, fastCommands} = ctx.collectedInputContext
    const hasAnyMcpConfig = skills?.some(s => s.mcpConfig != null) ?? false

    if (hasAnyMcpConfig) {
      const mcpConfigPath = path.join(globalDir, MCP_CONFIG_FILE)
      results.push({
        pathKind: FilePathKind.Relative,
        path: MCP_CONFIG_FILE,
        basePath: globalDir,
        getDirectoryName: () => GLOBAL_CONFIG_DIR,
        getAbsolutePath: () => mcpConfigPath
      })
    }

    if (fastCommands != null && fastCommands.length > 0) {
      const commandsDir = this.getGlobalCommandsDir()
      const transformOptions = this.getTransformOptionsFromContext(ctx, {includeSeriesPrefix: true})
      for (const cmd of fastCommands) {
        const fileName = this.transformFastCommandName(cmd, transformOptions)
        const fullPath = path.join(commandsDir, fileName)
        results.push({
          pathKind: FilePathKind.Relative,
          path: path.join(COMMANDS_SUBDIR, fileName),
          basePath: globalDir,
          getDirectoryName: () => COMMANDS_SUBDIR,
          getAbsolutePath: () => fullPath
        })
      }
    }

    if (skills == null || skills.length === 0) return results

    const skillsCursorDir = this.getSkillsCursorDir()
    for (const skill of skills) {
      const skillName = skill.yamlFrontMatter.name
      if (this.isPreservedSkill(skillName)) continue

      const skillDir = path.join(skillsCursorDir, skillName)
      results.push({
        pathKind: FilePathKind.Relative,
        path: path.join(SKILLS_CURSOR_SUBDIR, skillName, SKILL_FILE_NAME),
        basePath: globalDir,
        getDirectoryName: () => skillName,
        getAbsolutePath: () => path.join(skillDir, SKILL_FILE_NAME)
      })

      if (skill.mcpConfig != null) {
        results.push({
          pathKind: FilePathKind.Relative,
          path: path.join(SKILLS_CURSOR_SUBDIR, skillName, MCP_CONFIG_FILE),
          basePath: globalDir,
          getDirectoryName: () => skillName,
          getAbsolutePath: () => path.join(skillDir, MCP_CONFIG_FILE)
        })
      }

      if (skill.childDocs != null) {
        for (const childDoc of skill.childDocs) {
          const outputRelativePath = childDoc.relativePath.replace(/\.mdx$/, '.md')
          results.push({
            pathKind: FilePathKind.Relative,
            path: path.join(SKILLS_CURSOR_SUBDIR, skillName, outputRelativePath),
            basePath: globalDir,
            getDirectoryName: () => skillName,
            getAbsolutePath: () => path.join(skillDir, outputRelativePath)
          })
        }
      }

      if (skill.resources != null) {
        for (const resource of skill.resources) {
          results.push({
            pathKind: FilePathKind.Relative,
            path: path.join(SKILLS_CURSOR_SUBDIR, skillName, resource.relativePath),
            basePath: globalDir,
            getDirectoryName: () => skillName,
            getAbsolutePath: () => path.join(skillDir, resource.relativePath)
          })
        }
      }
    }
    return results
  }

  async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {workspace, globalMemory} = ctx.collectedInputContext
    if (globalMemory == null) return results

    for (const project of workspace.projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue
      results.push(this.createProjectRulesDirRelativePath(projectDir))
    }
    return results
  }

  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {workspace, globalMemory} = ctx.collectedInputContext
    if (globalMemory == null) return results

    for (const project of workspace.projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue
      results.push(this.createProjectRuleFileRelativePath(projectDir, GLOBAL_RULE_FILE))
    }
    return results
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {workspace, skills, fastCommands, globalMemory} = ctx.collectedInputContext
    const hasSkills = (skills?.length ?? 0) > 0
    const hasFastCommands = (fastCommands?.length ?? 0) > 0
    const hasGlobalRuleOutput
      = globalMemory != null
        && workspace.projects.some(p => p.dirFromWorkspacePath != null)

    if (hasSkills || hasFastCommands || hasGlobalRuleOutput) return true

    this.log.trace({action: 'skip', reason: 'noOutputs'})
    return false
  }

  async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {skills, fastCommands} = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    if (skills != null && skills.length > 0) {
      const mcpResult = await this.writeGlobalMcpConfig(ctx, skills)
      if (mcpResult != null) fileResults.push(mcpResult)

      const skillsCursorDir = this.getSkillsCursorDir()
      for (const skill of skills) {
        const skillName = skill.yamlFrontMatter.name
        if (this.isPreservedSkill(skillName)) continue

        const skillResults = await this.writeGlobalSkill(ctx, skillsCursorDir, skill)
        fileResults.push(...skillResults)
      }
    }

    if (fastCommands == null || fastCommands.length === 0) return {files: fileResults, dirs: dirResults}

    const commandsDir = this.getGlobalCommandsDir()
    for (const cmd of fastCommands) {
      const result = await this.writeGlobalFastCommand(ctx, commandsDir, cmd)
      fileResults.push(result)
    }
    return {files: fileResults, dirs: dirResults}
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []
    const {workspace, globalMemory} = ctx.collectedInputContext
    if (globalMemory == null) return {files: fileResults, dirs: dirResults}

    const content = this.buildGlobalRuleContent(globalMemory.content as string)
    for (const project of workspace.projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue
      const result = await this.writeProjectGlobalRule(ctx, project, content)
      fileResults.push(result)
    }
    return {files: fileResults, dirs: dirResults}
  }

  private createProjectRulesDirRelativePath(projectDir: RelativePath): RelativePath {
    const rulesDirPath = path.join(projectDir.path, GLOBAL_CONFIG_DIR, RULES_SUBDIR)
    return {
      pathKind: FilePathKind.Relative,
      path: rulesDirPath,
      basePath: projectDir.basePath,
      getDirectoryName: () => RULES_SUBDIR,
      getAbsolutePath: () => path.join(projectDir.basePath, rulesDirPath)
    }
  }

  private createProjectRuleFileRelativePath(projectDir: RelativePath, fileName: string): RelativePath {
    const filePath = path.join(projectDir.path, GLOBAL_CONFIG_DIR, RULES_SUBDIR, fileName)
    return {
      pathKind: FilePathKind.Relative,
      path: filePath,
      basePath: projectDir.basePath,
      getDirectoryName: () => RULES_SUBDIR,
      getAbsolutePath: () => path.join(projectDir.basePath, filePath)
    }
  }

  private buildGlobalRuleContent(content: string): string {
    const fmData: Record<string, unknown> = {
      description: 'Global prompt (synced)',
      alwaysApply: true
    }
    return buildMarkdownWithFrontMatter(fmData, content)
  }

  private async writeProjectGlobalRule(
    ctx: OutputWriteContext,
    project: Project,
    content: string
  ): Promise<WriteResult> {
    const projectDir = project.dirFromWorkspacePath!
    const rulesDir = path.join(projectDir.basePath, projectDir.path, GLOBAL_CONFIG_DIR, RULES_SUBDIR)
    const fullPath = path.join(rulesDir, GLOBAL_RULE_FILE)
    const relativePath = this.createProjectRuleFileRelativePath(projectDir, GLOBAL_RULE_FILE)

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'globalRule', path: fullPath})
      return {path: relativePath, success: true, skipped: false}
    }

    try {
      this.ensureDirectory(rulesDir)
      this.writeFileSync(fullPath, content)
      this.log.trace({action: 'write', type: 'globalRule', path: fullPath})
      return {path: relativePath, success: true}
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'globalRule', path: fullPath, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
  }

  private isPreservedSkill(name: string): boolean {
    return PRESERVED_SKILLS.has(name)
  }

  private getSkillsCursorDir(): string {
    return path.join(this.getGlobalConfigDir(), SKILLS_CURSOR_SUBDIR)
  }

  private getGlobalCommandsDir(): string {
    return path.join(this.getGlobalConfigDir(), COMMANDS_SUBDIR)
  }

  private async writeGlobalFastCommand(
    ctx: OutputWriteContext,
    commandsDir: string,
    cmd: FastCommandPrompt
  ): Promise<WriteResult> {
    const transformOptions = this.getTransformOptionsFromContext(ctx, {includeSeriesPrefix: true})
    const fileName = this.transformFastCommandName(cmd, transformOptions)
    const fullPath = path.join(commandsDir, fileName)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(COMMANDS_SUBDIR, fileName),
      basePath: this.getGlobalConfigDir(),
      getDirectoryName: () => COMMANDS_SUBDIR,
      getAbsolutePath: () => fullPath
    }

    const content = this.buildMarkdownContentWithRaw(
      cmd.content,
      cmd.yamlFrontMatter,
      cmd.rawFrontMatter
    )

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'globalFastCommand', path: fullPath})
      return {path: relativePath, success: true, skipped: false}
    }

    try {
      this.ensureDirectory(commandsDir)
      fs.writeFileSync(fullPath, content)
      this.log.trace({action: 'write', type: 'globalFastCommand', path: fullPath})
      return {path: relativePath, success: true}
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'globalFastCommand', path: fullPath, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
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

  private async writeGlobalSkill(
    ctx: OutputWriteContext,
    skillsDir: string,
    skill: SkillPrompt
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const skillName = skill.yamlFrontMatter.name
    const skillDir = path.join(skillsDir, skillName)
    const skillFilePath = path.join(skillDir, SKILL_FILE_NAME)
    const globalDir = this.getGlobalConfigDir()

    const skillRelativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(SKILLS_CURSOR_SUBDIR, skillName, SKILL_FILE_NAME),
      basePath: globalDir,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => skillFilePath
    }

    const frontMatterData = this.buildSkillFrontMatter(skill)
    const bodyContent = skill.content as string
    const skillContent = buildMarkdownWithFrontMatter(frontMatterData, bodyContent)

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

    if (skill.mcpConfig != null) {
      const mcpResult = await this.writeSkillMcpConfig(ctx, skill, skillDir, globalDir)
      results.push(mcpResult)
    }

    if (skill.childDocs != null) {
      for (const childDoc of skill.childDocs) {
        const childResult = await this.writeSkillChildDoc(ctx, childDoc, skillDir, skillName, globalDir)
        results.push(childResult)
      }
    }

    if (skill.resources != null) {
      for (const resource of skill.resources) {
        const resourceResult = await this.writeSkillResource(ctx, resource, skillDir, skillName, globalDir)
        results.push(resourceResult)
      }
    }

    return results
  }

  private buildSkillFrontMatter(skill: SkillPrompt): Record<string, unknown> {
    const fm = skill.yamlFrontMatter
    return {
      name: fm.name,
      description: fm.description,
      ...fm.displayName != null && {displayName: fm.displayName},
      ...fm.keywords != null && fm.keywords.length > 0 && {keywords: fm.keywords},
      ...fm.author != null && {author: fm.author},
      ...fm.version != null && {version: fm.version},
      ...fm.allowTools != null && fm.allowTools.length > 0 && {allowTools: fm.allowTools}
    }
  }

  private async writeSkillMcpConfig(
    ctx: OutputWriteContext,
    skill: SkillPrompt,
    skillDir: string,
    globalDir: string
  ): Promise<WriteResult> {
    const skillName = skill.yamlFrontMatter.name
    const mcpConfigPath = path.join(skillDir, MCP_CONFIG_FILE)
    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(SKILLS_CURSOR_SUBDIR, skillName, MCP_CONFIG_FILE),
      basePath: globalDir,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => mcpConfigPath
    }
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

  private async writeSkillChildDoc(
    ctx: OutputWriteContext,
    childDoc: {relativePath: string, content: unknown},
    skillDir: string,
    skillName: string,
    globalDir: string
  ): Promise<WriteResult> {
    const outputRelativePath = childDoc.relativePath.replace(/\.mdx$/, '.md')
    const childDocPath = path.join(skillDir, outputRelativePath)
    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(SKILLS_CURSOR_SUBDIR, skillName, outputRelativePath),
      basePath: globalDir,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => childDocPath
    }
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

  private async writeSkillResource(
    ctx: OutputWriteContext,
    resource: {relativePath: string, content: string, encoding: 'text' | 'base64'},
    skillDir: string,
    skillName: string,
    globalDir: string
  ): Promise<WriteResult> {
    const resourcePath = path.join(skillDir, resource.relativePath)
    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(SKILLS_CURSOR_SUBDIR, skillName, resource.relativePath),
      basePath: globalDir,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => resourcePath
    }

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
}
