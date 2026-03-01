import type {
  FastCommandPrompt,
  OutputPluginContext,
  OutputWriteContext,
  Project,
  ProjectChildrenMemoryPrompt,
  SkillPrompt,
  WriteResult,
  WriteResults
} from '@truenine/plugin-shared'
import type {RelativePath} from '@truenine/plugin-shared/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {getPlatformFixedDir} from '@truenine/desk-paths'
import {buildMarkdownWithFrontMatter} from '@truenine/md-compiler/markdown'
import {AbstractOutputPlugin, filterCommandsByProjectConfig, filterSkillsByProjectConfig} from '@truenine/plugin-output-shared'
import {FilePathKind, PLUGIN_NAMES} from '@truenine/plugin-shared'

/**
 * Represents the filename of the project memory file.
 */
const PROJECT_MEMORY_FILE = 'AGENTS.md'
/**
 * Specifies the name of the subdirectory where prompt files are stored.
 */
const PROMPTS_SUBDIR = 'prompts'
/**
 * Represents the name of the subdirectory where skill-related resources are stored.
 */
const SKILLS_SUBDIR = 'skills'
/**
 * The file name that represents the skill definition file.
 */
const SKILL_FILE_NAME = 'SKILL.md'
const AIASSISTANT_DIR = '.aiassistant'
const RULES_SUBDIR = 'rules'
const ROOT_RULE_FILE = 'always.md'
const CHILD_RULE_FILE_PREFIX = 'glob-'
const RULE_APPLY_ALWAYS = '\u59CB\u7EC8'
const RULE_APPLY_GLOB = '\u6309\u6587\u4EF6\u6A21\u5F0F'
const RULE_GLOB_KEY = '\u6A21\u5F0F'
/**
 * Represents the directory name used for storing JetBrains-related resources or files.
 */
const JETBRAINS_VENDOR_DIR = 'JetBrains'
/**
 * Represents the directory path where the AIA files are stored.
 */
const AIA_DIR = 'aia'
/**
 * Represents the directory path where the Codex-related files are stored.
 */
const CODEX_DIR = 'codex'

/**
 * An array of constant string literals representing the prefixes of JetBrains IDE directory names.
 */
const IDE_DIR_PREFIXES = [
  'IntelliJIdea',
  'WebStorm',
  'RustRover',
  'PyCharm',
  'PyCharmCE',
  'PhpStorm',
  'GoLand',
  'CLion',
  'DataGrip',
  'RubyMine',
  'Rider',
  'DataSpell',
  'Aqua'
] as const

/**
 * Represents an output plugin specifically designed for integration with JetBrains AI Assistant Codex.
 */
export class JetBrainsAIAssistantCodexOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('JetBrainsAIAssistantCodexOutputPlugin', {
      outputFileName: PROJECT_MEMORY_FILE,
      dependsOn: [PLUGIN_NAMES.AgentsOutput],
      indexignore: '.aiignore'
    })
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

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue

      if (project.rootMemoryPrompt != null) results.push(this.createProjectRuleFileRelativePath(projectDir, ROOT_RULE_FILE))

      if (project.childMemoryPrompts != null) {
        for (const child of project.childMemoryPrompts) {
          const fileName = this.buildChildRuleFileName(child)
          results.push(this.createProjectRuleFileRelativePath(projectDir, fileName))
        }
      }
    }

    results.push(...this.registerProjectIgnoreOutputFiles(projects))
    return results
  }

  async registerGlobalOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const codexDirs = this.resolveCodexDirs()
    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)

    for (const codexDir of codexDirs) {
      const promptsPath = path.join(codexDir, PROMPTS_SUBDIR)
      results.push({
        pathKind: FilePathKind.Relative,
        path: PROMPTS_SUBDIR,
        basePath: codexDir,
        getDirectoryName: () => PROMPTS_SUBDIR,
        getAbsolutePath: () => promptsPath
      })

      const {skills} = ctx.collectedInputContext
      if (skills == null || skills.length === 0) continue

      const filteredSkills = filterSkillsByProjectConfig(skills, projectConfig)
      for (const skill of filteredSkills) {
        const skillName = skill.yamlFrontMatter?.name ?? skill.dir.getDirectoryName()
        const skillPath = path.join(codexDir, SKILLS_SUBDIR, skillName)
        results.push({
          pathKind: FilePathKind.Relative,
          path: path.join(SKILLS_SUBDIR, skillName),
          basePath: codexDir,
          getDirectoryName: () => skillName,
          getAbsolutePath: () => skillPath
        })
      }
    }

    return results
  }

  async registerGlobalOutputFiles(): Promise<RelativePath[]> {
    const codexDirs = this.resolveCodexDirs()
    return codexDirs.map(codexDir => ({
      pathKind: FilePathKind.Relative,
      path: PROJECT_MEMORY_FILE,
      basePath: codexDir,
      getDirectoryName: () => CODEX_DIR,
      getAbsolutePath: () => path.join(codexDir, PROJECT_MEMORY_FILE)
    }))
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {globalMemory, fastCommands, skills, workspace, aiAgentIgnoreConfigFiles} = ctx.collectedInputContext
    const hasGlobalMemory = globalMemory != null
    const hasFastCommands = (fastCommands?.length ?? 0) > 0
    const hasSkills = (skills?.length ?? 0) > 0
    const hasProjectPrompts = workspace.projects.some(
      project => project.rootMemoryPrompt != null || (project.childMemoryPrompts?.length ?? 0) > 0
    )
    const hasAiIgnore = aiAgentIgnoreConfigFiles?.some(f => f.fileName === '.aiignore') ?? false

    if (hasGlobalMemory || hasFastCommands || hasSkills || hasProjectPrompts || hasAiIgnore) return true

    this.log.trace({action: 'skip', reason: 'noOutputs'})
    return false
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {projects} = ctx.collectedInputContext.workspace
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue

      if (project.rootMemoryPrompt != null) {
        const content = this.buildAlwaysRuleContent(project.rootMemoryPrompt.content as string)
        const result = await this.writeProjectRuleFile(ctx, project, ROOT_RULE_FILE, content, 'projectRootRule')
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

    const ignoreResults = await this.writeProjectIgnoreFiles(ctx)
    fileResults.push(...ignoreResults)

    return {files: fileResults, dirs: dirResults}
  }

  async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {globalMemory, fastCommands, skills} = ctx.collectedInputContext
    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []
    const codexDirs = this.resolveCodexDirs()

    if (codexDirs.length === 0) return {files: fileResults, dirs: dirResults}

    const filteredCommands = fastCommands != null ? filterCommandsByProjectConfig(fastCommands, projectConfig) : []
    const filteredSkills = skills != null ? filterSkillsByProjectConfig(skills, projectConfig) : []

    for (const codexDir of codexDirs) {
      if (globalMemory != null) {
        const fullPath = path.join(codexDir, PROJECT_MEMORY_FILE)
        const relativePath: RelativePath = {
          pathKind: FilePathKind.Relative,
          path: PROJECT_MEMORY_FILE,
          basePath: codexDir,
          getDirectoryName: () => CODEX_DIR,
          getAbsolutePath: () => fullPath
        }

        if (ctx.dryRun === true) {
          this.log.trace({action: 'dryRun', type: 'globalMemory', path: fullPath})
          fileResults.push({path: relativePath, success: true, skipped: false})
        } else {
          try {
            this.ensureDirectory(codexDir)
            fs.writeFileSync(fullPath, globalMemory.content as string, 'utf8')
            this.log.trace({action: 'write', type: 'globalMemory', path: fullPath})
            fileResults.push({path: relativePath, success: true})
          }
          catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error)
            this.log.error({action: 'write', type: 'globalMemory', path: fullPath, error: errMsg})
            fileResults.push({path: relativePath, success: false, error: error as Error})
          }
        }
      }

      if (filteredCommands.length > 0) {
        for (const cmd of filteredCommands) {
          const cmdResults = await this.writeGlobalFastCommand(ctx, codexDir, cmd)
          fileResults.push(...cmdResults)
        }
      }

      if (filteredSkills.length === 0) continue

      for (const skill of filteredSkills) {
        const skillResults = await this.writeGlobalSkill(ctx, codexDir, skill)
        fileResults.push(...skillResults)
      }
    }

    return {files: fileResults, dirs: dirResults}
  }

  private resolveCodexDirs(): string[] {
    const baseDir = path.join(getPlatformFixedDir(), JETBRAINS_VENDOR_DIR)
    if (!this.existsSync(baseDir)) return []

    try {
      const dirents = this.readdirSync(baseDir, {withFileTypes: true})
      const ideDirs = dirents.filter(dirent => {
        if (!dirent.isDirectory()) return false
        return this.isSupportedIdeDir(dirent.name)
      })
      return ideDirs.map(dirent => path.join(baseDir, dirent.name, AIA_DIR, CODEX_DIR))
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.warn({action: 'scan', type: 'jetbrains', path: baseDir, error: errMsg})
      return []
    }
  }

  private createProjectRulesDirRelativePath(projectDir: RelativePath): RelativePath {
    const rulesDirPath = path.join(projectDir.path, AIASSISTANT_DIR, RULES_SUBDIR)
    return {
      pathKind: FilePathKind.Relative,
      path: rulesDirPath,
      basePath: projectDir.basePath,
      getDirectoryName: () => RULES_SUBDIR,
      getAbsolutePath: () => path.join(projectDir.basePath, rulesDirPath)
    }
  }

  private createProjectRuleFileRelativePath(projectDir: RelativePath, fileName: string): RelativePath {
    const filePath = path.join(projectDir.path, AIASSISTANT_DIR, RULES_SUBDIR, fileName)
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
      apply: RULE_APPLY_ALWAYS
    }

    return buildMarkdownWithFrontMatter(fmData, content)
  }

  private buildGlobRuleContent(child: ProjectChildrenMemoryPrompt): string {
    const pattern = this.buildChildRulePattern(child)
    const fmData: Record<string, unknown> = {
      apply: RULE_APPLY_GLOB,
      [RULE_GLOB_KEY]: pattern
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
    const rulesDir = path.join(projectDir.basePath, projectDir.path, AIASSISTANT_DIR, RULES_SUBDIR)
    const fullPath = path.join(rulesDir, fileName)

    const relativePath = this.createProjectRuleFileRelativePath(projectDir, fileName)

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: label, path: fullPath})
      return {path: relativePath, success: true, skipped: false}
    }

    try {
      this.ensureDirectory(rulesDir)
      fs.writeFileSync(fullPath, content, 'utf8')
      this.log.trace({action: 'write', type: label, path: fullPath})
      return {path: relativePath, success: true}
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: label, path: fullPath, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
  }

  private isSupportedIdeDir(dirName: string): boolean {
    return IDE_DIR_PREFIXES.some(prefix => dirName.startsWith(prefix))
  }

  private async writeGlobalFastCommand(
    ctx: OutputWriteContext,
    codexDir: string,
    cmd: FastCommandPrompt
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const transformOptions = this.getTransformOptionsFromContext(ctx)
    const fileName = this.transformFastCommandName(cmd, transformOptions)
    const targetDir = path.join(codexDir, PROMPTS_SUBDIR)
    const fullPath = path.join(targetDir, fileName)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(PROMPTS_SUBDIR, fileName),
      basePath: codexDir,
      getDirectoryName: () => PROMPTS_SUBDIR,
      getAbsolutePath: () => fullPath
    }

    const content = this.buildMarkdownContentWithRaw(
      cmd.content,
      cmd.yamlFrontMatter,
      cmd.rawFrontMatter
    )

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'globalFastCommand', path: fullPath})
      return [{path: relativePath, success: true, skipped: false}]
    }

    try {
      this.ensureDirectory(targetDir)
      fs.writeFileSync(fullPath, content, 'utf8')
      this.log.trace({action: 'write', type: 'globalFastCommand', path: fullPath})
      results.push({path: relativePath, success: true})
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'globalFastCommand', path: fullPath, error: errMsg})
      results.push({path: relativePath, success: false, error: error as Error})
    }

    return results
  }

  private async writeGlobalSkill(
    ctx: OutputWriteContext,
    codexDir: string,
    skill: SkillPrompt
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const skillName = skill.yamlFrontMatter?.name ?? skill.dir.getDirectoryName()
    const targetDir = path.join(codexDir, SKILLS_SUBDIR, skillName)
    const fullPath = path.join(targetDir, SKILL_FILE_NAME)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(SKILLS_SUBDIR, skillName, SKILL_FILE_NAME),
      basePath: codexDir,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => fullPath
    }

    const content = this.buildCodexSkillContent(skill)

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'globalSkill', path: fullPath})
      return [{path: relativePath, success: true, skipped: false}]
    }

    try {
      this.ensureDirectory(targetDir)
      fs.writeFileSync(fullPath, content, 'utf8')
      this.log.trace({action: 'write', type: 'globalSkill', path: fullPath})
      results.push({path: relativePath, success: true})

      if (skill.childDocs != null) {
        for (const refDoc of skill.childDocs) {
          const refResults = await this.writeSkillReferenceDocument(ctx, targetDir, skillName, refDoc, codexDir)
          results.push(...refResults)
        }
      }

      if (skill.resources != null) {
        for (const resource of skill.resources) {
          const resourceResults = await this.writeSkillResource(ctx, targetDir, skillName, resource, codexDir)
          results.push(...resourceResults)
        }
      }
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'globalSkill', path: fullPath, error: errMsg})
      results.push({path: relativePath, success: false, error: error as Error})
    }

    return results
  }

  private buildCodexSkillContent(skill: SkillPrompt): string {
    const fm = skill.yamlFrontMatter

    const name = this.normalizeSkillName(fm.name, 64)
    const description = this.normalizeToSingleLine(fm.description, 1024)

    const metadata: Record<string, unknown> = {}

    if (fm.displayName != null) metadata['short-description'] = fm.displayName
    if (fm.version != null) metadata['version'] = fm.version
    if (fm.author != null) metadata['author'] = fm.author
    if (fm.keywords != null && fm.keywords.length > 0) metadata['keywords'] = [...fm.keywords]

    const fmData: Record<string, unknown> = {
      name,
      description
    }

    if (Object.keys(metadata).length > 0) fmData['metadata'] = metadata
    if (fm.allowTools != null && fm.allowTools.length > 0) fmData['allowed-tools'] = fm.allowTools.join(' ')

    return buildMarkdownWithFrontMatter(fmData, skill.content as string)
  }

  private normalizeSkillName(name: string, maxLength: number): string {
    let normalized = name
      .toLowerCase()
      .replaceAll(/[^a-z0-9-]/g, '-')
      .replaceAll(/-+/g, '-')
      .replaceAll(/^-+|-+$/g, '')

    if (normalized.length > maxLength) normalized = normalized.slice(0, maxLength).replace(/-+$/, '')

    return normalized
  }

  private normalizeToSingleLine(text: string, maxLength: number): string {
    const singleLine = text.replaceAll(/[\r\n]+/g, ' ').replaceAll(/\s+/g, ' ').trim()
    if (singleLine.length > maxLength) return `${singleLine.slice(0, maxLength - 3)}...`
    return singleLine
  }

  private async writeSkillReferenceDocument(
    ctx: OutputWriteContext,
    skillDir: string,
    skillName: string,
    refDoc: {dir: RelativePath, content: unknown},
    codexDir: string
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const fileName = refDoc.dir.path.replace(/\.mdx$/, '.md')
    const fullPath = path.join(skillDir, fileName)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(SKILLS_SUBDIR, skillName, fileName),
      basePath: codexDir,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => fullPath
    }

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'skillRefDoc', path: fullPath})
      return [{path: relativePath, success: true, skipped: false}]
    }

    try {
      const parentDir = path.dirname(fullPath)
      this.ensureDirectory(parentDir)
      fs.writeFileSync(fullPath, refDoc.content as string, 'utf8')
      this.log.trace({action: 'write', type: 'skillRefDoc', path: fullPath})
      results.push({path: relativePath, success: true})
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'skillRefDoc', path: fullPath, error: errMsg})
      results.push({path: relativePath, success: false, error: error as Error})
    }

    return results
  }

  private async writeSkillResource(
    ctx: OutputWriteContext,
    skillDir: string,
    skillName: string,
    resource: {relativePath: string, content: string},
    codexDir: string
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const fullPath = path.join(skillDir, resource.relativePath)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(SKILLS_SUBDIR, skillName, resource.relativePath),
      basePath: codexDir,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => fullPath
    }

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'skillResource', path: fullPath})
      return [{path: relativePath, success: true, skipped: false}]
    }

    try {
      const parentDir = path.dirname(fullPath)
      this.ensureDirectory(parentDir)
      fs.writeFileSync(fullPath, resource.content, 'utf8')
      this.log.trace({action: 'write', type: 'skillResource', path: fullPath})
      results.push({path: relativePath, success: true})
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'skillResource', path: fullPath, error: errMsg})
      results.push({path: relativePath, success: false, error: error as Error})
    }

    return results
  }
}
