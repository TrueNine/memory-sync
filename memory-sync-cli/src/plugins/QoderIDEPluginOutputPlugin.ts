import type {
  FastCommandPrompt,
  OutputPluginContext,
  OutputWriteContext,
  Project,
  ProjectChildrenMemoryPrompt,
  SkillPrompt,
  WriteResult,
  WriteResults
} from '@/types'
import type {RelativePath} from '@/types/FileSystemTypes'
import {Buffer} from 'node:buffer'
import * as path from 'node:path'
import {buildMarkdownWithFrontMatter} from '@/markdown'
import {FilePathKind} from '@/types'
import {AbstractOutputPlugin} from './AbstractOutputPlugin'

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

export class QoderIDEPluginOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('QoderIDEPluginOutputPlugin', {globalConfigDir: QODER_CONFIG_DIR})
  }

  async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {projects} = ctx.collectedInputContext.workspace

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) continue
      results.push(this.createProjectRulesDirRelativePath(project.dirFromWorkspacePath))
    }

    return results
  }

  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {projects} = ctx.collectedInputContext.workspace
    const {globalMemory} = ctx.collectedInputContext

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue

      if (globalMemory != null) results.push(this.createProjectRuleFileRelativePath(projectDir, GLOBAL_RULE_FILE))

      if (project.rootMemoryPrompt != null) results.push(this.createProjectRuleFileRelativePath(projectDir, PROJECT_RULE_FILE))

      if (project.childMemoryPrompts != null) {
        for (const child of project.childMemoryPrompts) {
          const fileName = this.buildChildRuleFileName(child)
          results.push(this.createProjectRuleFileRelativePath(projectDir, fileName))
        }
      }
    }

    return results
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
        const skillPath = path.join(globalDir, SKILLS_SUBDIR, skillName)
        results.push({
          pathKind: FilePathKind.Relative,
          path: path.join(SKILLS_SUBDIR, skillName),
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
    const {fastCommands, skills} = ctx.collectedInputContext

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

    const skillsDir = this.getGlobalSkillsDir()
    for (const skill of skills) {
      const skillName = skill.yamlFrontMatter.name
      const skillDir = path.join(skillsDir, skillName)

      results.push({
        pathKind: FilePathKind.Relative,
        path: path.join(SKILLS_SUBDIR, skillName, SKILL_FILE_NAME),
        basePath: globalDir,
        getDirectoryName: () => skillName,
        getAbsolutePath: () => path.join(skillDir, SKILL_FILE_NAME)
      })

      if (skill.mcpConfig != null) {
        results.push({
          pathKind: FilePathKind.Relative,
          path: path.join(SKILLS_SUBDIR, skillName, MCP_CONFIG_FILE),
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
            path: path.join(SKILLS_SUBDIR, skillName, outputRelativePath),
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
            path: path.join(SKILLS_SUBDIR, skillName, resource.relativePath),
            basePath: globalDir,
            getDirectoryName: () => skillName,
            getAbsolutePath: () => path.join(skillDir, resource.relativePath)
          })
        }
      }
    }
    return results
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {workspace, globalMemory, fastCommands, skills} = ctx.collectedInputContext
    const hasProjectPrompts = workspace.projects.some(
      project => project.rootMemoryPrompt != null || (project.childMemoryPrompts?.length ?? 0) > 0
    )
    const hasGlobalMemory = globalMemory != null
    const hasFastCommands = (fastCommands?.length ?? 0) > 0
    const hasSkills = (skills?.length ?? 0) > 0

    if (hasProjectPrompts || hasGlobalMemory || hasFastCommands || hasSkills) return true

    this.log.trace({action: 'skip', reason: 'noOutputs'})
    return false
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {projects} = ctx.collectedInputContext.workspace
    const {globalMemory} = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue

      if (globalMemory != null) {
        const content = this.buildAlwaysRuleContent(globalMemory.content as string)
        const result = await this.writeProjectRuleFile(ctx, project, GLOBAL_RULE_FILE, content, 'globalRule')
        fileResults.push(result)
      }

      if (project.rootMemoryPrompt != null) {
        const content = this.buildAlwaysRuleContent(project.rootMemoryPrompt.content as string)
        const result = await this.writeProjectRuleFile(ctx, project, PROJECT_RULE_FILE, content, 'projectRootRule')
        fileResults.push(result)
      }

      if (project.childMemoryPrompts != null) {
        for (const child of project.childMemoryPrompts) {
          const fileName = this.buildChildRuleFileName(child)
          const content = this.buildGlobRuleContent(child)
          const result = await this.writeProjectRuleFile(ctx, project, fileName, content, 'projectChildRule')
          fileResults.push(result)
        }
      }
    }

    return {files: fileResults, dirs: dirResults}
  }

  async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {fastCommands, skills} = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    if (fastCommands != null && fastCommands.length > 0) {
      const commandsDir = this.getGlobalCommandsDir()
      for (const cmd of fastCommands) {
        const result = await this.writeGlobalFastCommand(ctx, commandsDir, cmd)
        fileResults.push(result)
      }
    }

    if (skills == null || skills.length === 0) return {files: fileResults, dirs: dirResults}

    const skillsDir = this.getGlobalSkillsDir()
    for (const skill of skills) {
      const skillResults = await this.writeGlobalSkill(ctx, skillsDir, skill)
      fileResults.push(...skillResults)
    }
    return {files: fileResults, dirs: dirResults}
  }

  private getGlobalCommandsDir(): string {
    return this.joinPath(this.getGlobalConfigDir(), COMMANDS_SUBDIR)
  }

  private createProjectRulesDirRelativePath(projectDir: RelativePath): RelativePath {
    const rulesDirPath = path.join(projectDir.path, QODER_CONFIG_DIR, RULES_SUBDIR)
    return {
      pathKind: FilePathKind.Relative,
      path: rulesDirPath,
      basePath: projectDir.basePath,
      getDirectoryName: () => RULES_SUBDIR,
      getAbsolutePath: () => path.join(projectDir.basePath, rulesDirPath)
    }
  }

  private createProjectRuleFileRelativePath(projectDir: RelativePath, fileName: string): RelativePath {
    const filePath = path.join(projectDir.path, QODER_CONFIG_DIR, RULES_SUBDIR, fileName)
    return {
      pathKind: FilePathKind.Relative,
      path: filePath,
      basePath: projectDir.basePath,
      getDirectoryName: () => RULES_SUBDIR,
      getAbsolutePath: () => path.join(projectDir.basePath, filePath)
    }
  }

  private buildChildRuleFileName(child: ProjectChildrenMemoryPrompt): string {
    const childPath = child.workingChildDirectoryPath?.path ?? child.dir.path
    const normalizedPath = childPath
      .replaceAll('\\', '/')
      .replaceAll(/^\/+|\/+$/g, '')
      .replaceAll('/', '-')

    const suffix = normalizedPath.length > 0 ? normalizedPath : 'root'
    return `${CHILD_RULE_FILE_PREFIX}${suffix}.md`
  }

  private buildChildRulePattern(child: ProjectChildrenMemoryPrompt): string {
    const childPath = child.workingChildDirectoryPath?.path ?? child.dir.path
    const normalizedPath = childPath
      .replaceAll('\\', '/')
      .replaceAll(/^\/+|\/+$/g, '')

    if (normalizedPath.length === 0) return '**/*'
    return `${normalizedPath}/**`
  }

  private buildAlwaysRuleContent(content: string): string {
    const fmData: Record<string, unknown> = {
      trigger: TRIGGER_ALWAYS,
      type: 'user_command'
    }

    return buildMarkdownWithFrontMatter(fmData, content)
  }

  private buildGlobRuleContent(child: ProjectChildrenMemoryPrompt): string {
    const pattern = this.buildChildRulePattern(child)
    const fmData: Record<string, unknown> = {
      trigger: TRIGGER_GLOB,
      [RULE_GLOB_KEY]: pattern,
      type: 'user_command'
    }

    return buildMarkdownWithFrontMatter(fmData, child.content as string)
  }

  private async writeProjectRuleFile(
    ctx: OutputWriteContext,
    project: Project,
    fileName: string,
    content: string,
    label: string
  ): Promise<WriteResult> {
    const projectDir = project.dirFromWorkspacePath!
    const rulesDir = path.join(projectDir.basePath, projectDir.path, QODER_CONFIG_DIR, RULES_SUBDIR)
    const fullPath = path.join(rulesDir, fileName)

    const relativePath = this.createProjectRuleFileRelativePath(projectDir, fileName)

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: label, path: fullPath})
      return {path: relativePath, success: true, skipped: false}
    }

    try {
      this.ensureDirectory(rulesDir)
      this.writeFileSync(fullPath, content)
      this.log.trace({action: 'write', type: label, path: fullPath})
      return {path: relativePath, success: true}
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: label, path: fullPath, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
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
      path: fileName,
      basePath: commandsDir,
      getDirectoryName: () => COMMANDS_SUBDIR,
      getAbsolutePath: () => fullPath
    }

    const frontMatterData = this.buildFastCommandFrontMatter(cmd)
    const content = buildMarkdownWithFrontMatter(frontMatterData, cmd.content)

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'globalFastCommand', path: fullPath})
      return {path: relativePath, success: true, skipped: false}
    }

    try {
      this.ensureDirectory(commandsDir)
      this.writeFileSync(fullPath, content)
      this.log.trace({action: 'write', type: 'globalFastCommand', path: fullPath})
      return {path: relativePath, success: true}
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'globalFastCommand', path: fullPath, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
  }

  private getGlobalSkillsDir(): string {
    return this.joinPath(this.getGlobalConfigDir(), SKILLS_SUBDIR)
  }

  private async writeGlobalSkill(
    ctx: OutputWriteContext,
    skillsDir: string,
    skill: SkillPrompt
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const globalDir = this.getGlobalConfigDir()
    const skillName = skill.yamlFrontMatter.name
    const skillDir = path.join(skillsDir, skillName)
    const skillFilePath = path.join(skillDir, SKILL_FILE_NAME)

    const skillRelativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(SKILLS_SUBDIR, skillName, SKILL_FILE_NAME),
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
    if (fm == null) {
      return {
        description: 'Fast command',
        type: 'user_command'
      }
    }

    return {
      description: fm.description,
      type: 'user_command',
      ...fm.argumentHint != null && {argumentHint: fm.argumentHint},
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
      path: path.join(SKILLS_SUBDIR, skillName, MCP_CONFIG_FILE),
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
      path: path.join(SKILLS_SUBDIR, skillName, outputRelativePath),
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
      path: path.join(SKILLS_SUBDIR, skillName, resource.relativePath),
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
