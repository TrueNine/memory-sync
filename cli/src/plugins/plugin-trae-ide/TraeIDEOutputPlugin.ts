import type {
  CommandPrompt,
  OutputPluginContext,
  OutputWriteContext,
  Project,
  ProjectChildrenMemoryPrompt,
  SkillPrompt,
  WriteResult,
  WriteResults
} from '../plugin-shared'
import type {RelativePath} from '../plugin-shared/types'
import {Buffer} from 'node:buffer'
import * as path from 'node:path'
import {buildMarkdownWithFrontMatter} from '@truenine/md-compiler/markdown'
import {AbstractOutputPlugin, filterCommandsByProjectConfig, filterSkillsByProjectConfig} from '@truenine/plugin-output-shared'
import {FilePathKind} from '../plugin-shared'

const GLOBAL_MEMORY_FILE = 'GLOBAL.md'
const GLOBAL_CONFIG_DIR = '.trae'
const STEERING_SUBDIR = 'steering'
const RULES_SUBDIR = 'rules'
const COMMANDS_SUBDIR = 'commands'
const SKILLS_SUBDIR = 'skills'
const SKILL_FILE_NAME = 'SKILL.md'

export class TraeIDEOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('TraeIDEOutputPlugin', {globalConfigDir: GLOBAL_CONFIG_DIR, outputFileName: GLOBAL_MEMORY_FILE, indexignore: '.traeignore'})
  }

  protected override getIgnoreOutputPath(): string | undefined {
    if (this.indexignore == null) return void 0
    return path.join('.trae', '.ignore')
  }

  private getGlobalSteeringDir(): string {
    return this.joinPath(this.getGlobalConfigDir(), STEERING_SUBDIR)
  }

  override async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const {projects} = ctx.collectedInputContext.workspace
    const {commands, skills} = ctx.collectedInputContext
    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const results: RelativePath[] = []

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue

      results.push(this.createRelativePath( // Register rules dir (existing)
        this.joinPath(projectDir.path, GLOBAL_CONFIG_DIR, RULES_SUBDIR),
        projectDir.basePath,
        () => RULES_SUBDIR
      ))

      if (commands != null && commands.length > 0) { // Register commands dir (new: per-project)
        const filteredCommands = filterCommandsByProjectConfig(commands, projectConfig)
        if (filteredCommands.length > 0) {
          results.push(this.createRelativePath(
            this.joinPath(projectDir.path, GLOBAL_CONFIG_DIR, COMMANDS_SUBDIR),
            projectDir.basePath,
            () => COMMANDS_SUBDIR
          ))
        }
      }

      if (skills != null && skills.length > 0) { // Register skills dirs (new: per-project)
        const filteredSkills = filterSkillsByProjectConfig(skills, projectConfig)
        for (const skill of filteredSkills) {
          const skillName = skill.yamlFrontMatter.name
          results.push(this.createRelativePath(
            this.joinPath(projectDir.path, GLOBAL_CONFIG_DIR, SKILLS_SUBDIR, skillName),
            projectDir.basePath,
            () => skillName
          ))
        }
      }
    }

    return results
  }

  override async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const {projects} = ctx.collectedInputContext.workspace
    const {commands, skills} = ctx.collectedInputContext
    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const results: RelativePath[] = []

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) continue
      const projectDir = project.dirFromWorkspacePath

      if (project.childMemoryPrompts != null) { // Child memory prompts (existing)
        for (const child of project.childMemoryPrompts) {
          results.push(this.createRelativePath(
            this.joinPath(projectDir.path, GLOBAL_CONFIG_DIR, RULES_SUBDIR, this.buildSteeringFileName(child)),
            projectDir.basePath,
            () => RULES_SUBDIR
          ))
        }
      }

      if (commands != null && commands.length > 0) { // Commands (new: per-project)
        const filteredCommands = filterCommandsByProjectConfig(commands, projectConfig)
        const transformOptions = this.getTransformOptionsFromContext(ctx, {includeSeriesPrefix: true})
        for (const cmd of filteredCommands) {
          const fileName = this.transformCommandName(cmd, transformOptions)
          results.push(this.createRelativePath(
            this.joinPath(projectDir.path, GLOBAL_CONFIG_DIR, COMMANDS_SUBDIR, fileName),
            projectDir.basePath,
            () => COMMANDS_SUBDIR
          ))
        }
      }

      if (skills != null && skills.length > 0) { // Skills (new: per-project)
        const filteredSkills = filterSkillsByProjectConfig(skills, projectConfig)
        for (const skill of filteredSkills) {
          const skillName = skill.yamlFrontMatter.name
          results.push(this.createRelativePath(
            this.joinPath(projectDir.path, GLOBAL_CONFIG_DIR, SKILLS_SUBDIR, skillName, SKILL_FILE_NAME),
            projectDir.basePath,
            () => skillName
          ))

          if (skill.childDocs != null) {
            for (const childDoc of skill.childDocs) {
              const outputRelativePath = childDoc.relativePath.replace(/\.mdx$/, '.md')
              results.push(this.createRelativePath(
                this.joinPath(projectDir.path, GLOBAL_CONFIG_DIR, SKILLS_SUBDIR, skillName, outputRelativePath),
                projectDir.basePath,
                () => skillName
              ))
            }
          }

          if (skill.resources != null) {
            for (const resource of skill.resources) {
              results.push(this.createRelativePath(
                this.joinPath(projectDir.path, GLOBAL_CONFIG_DIR, SKILLS_SUBDIR, skillName, resource.relativePath),
                projectDir.basePath,
                () => skillName
              ))
            }
          }
        }
      }
    }

    results.push(...this.registerProjectIgnoreOutputFiles(projects))
    return results
  }

  override async registerGlobalOutputDirs(): Promise<RelativePath[]> {
    return [
      this.createRelativePath(STEERING_SUBDIR, this.getGlobalConfigDir(), () => STEERING_SUBDIR)
    ]
  }

  override async registerGlobalOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const {globalMemory} = ctx.collectedInputContext
    const results: RelativePath[] = []

    if (globalMemory != null) results.push(this.createRelativePath(GLOBAL_MEMORY_FILE, this.getGlobalSteeringDir(), () => STEERING_SUBDIR))

    return results
  }

  override async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {workspace, globalMemory, commands, skills, aiAgentIgnoreConfigFiles} = ctx.collectedInputContext
    const hasChildPrompts = workspace.projects.some(p => (p.childMemoryPrompts?.length ?? 0) > 0)
    const hasCommands = (commands?.length ?? 0) > 0
    const hasSkills = (skills?.length ?? 0) > 0
    const hasTraeIgnore = aiAgentIgnoreConfigFiles?.some(f => f.fileName === '.traeignore') ?? false
    if (hasChildPrompts || globalMemory != null || hasCommands || hasSkills || hasTraeIgnore) return true
    this.log.trace({action: 'skip', reason: 'noOutputs'})
    return false
  }

  override async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {projects} = ctx.collectedInputContext.workspace
    const {commands, skills} = ctx.collectedInputContext
    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const fileResults: WriteResult[] = []

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) continue
      const projectDir = project.dirFromWorkspacePath

      if (project.childMemoryPrompts != null) { // Child memory prompts (existing)
        for (const child of project.childMemoryPrompts) fileResults.push(await this.writeSteeringFile(ctx, project, child))
      }

      if (commands != null && commands.length > 0) { // Commands (new: per-project)
        const filteredCommands = filterCommandsByProjectConfig(commands, projectConfig)
        for (const cmd of filteredCommands) fileResults.push(await this.writeProjectCommand(ctx, projectDir, cmd))
      }

      if (skills != null && skills.length > 0) { // Skills (new: per-project)
        const filteredSkills = filterSkillsByProjectConfig(skills, projectConfig)
        for (const skill of filteredSkills) fileResults.push(...await this.writeProjectSkill(ctx, projectDir, skill))
      }
    }

    const ignoreResults = await this.writeProjectIgnoreFiles(ctx)
    fileResults.push(...ignoreResults)

    return {files: fileResults, dirs: []}
  }

  override async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {globalMemory} = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const steeringDir = this.getGlobalSteeringDir()

    if (globalMemory != null) {
      fileResults.push(await this.writeFile(ctx, this.joinPath(steeringDir, GLOBAL_MEMORY_FILE), globalMemory.content as string, 'globalMemory'))
    }

    return {files: fileResults, dirs: []}
  }

  private async writeProjectCommand(ctx: OutputWriteContext, projectDir: RelativePath, cmd: CommandPrompt): Promise<WriteResult> {
    const transformOptions = this.getTransformOptionsFromContext(ctx, {includeSeriesPrefix: true})
    const fileName = this.transformCommandName(cmd, transformOptions)
    const commandsDir = path.join(projectDir.basePath, projectDir.path, GLOBAL_CONFIG_DIR, COMMANDS_SUBDIR)
    const fullPath = path.join(commandsDir, fileName)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(projectDir.path, GLOBAL_CONFIG_DIR, COMMANDS_SUBDIR, fileName),
      basePath: projectDir.basePath,
      getDirectoryName: () => COMMANDS_SUBDIR,
      getAbsolutePath: () => fullPath
    }

    const content = this.buildMarkdownContentWithRaw(cmd.content, cmd.yamlFrontMatter, cmd.rawFrontMatter)

    return this.writeFileWithHandling(ctx, fullPath, content, {
      type: 'projectCommand',
      relativePath
    })
  }

  private async writeProjectSkill(ctx: OutputWriteContext, projectDir: RelativePath, skill: SkillPrompt): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const skillName = skill.yamlFrontMatter.name
    const skillDir = path.join(projectDir.basePath, projectDir.path, GLOBAL_CONFIG_DIR, SKILLS_SUBDIR, skillName)
    const skillFilePath = path.join(skillDir, SKILL_FILE_NAME)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(projectDir.path, GLOBAL_CONFIG_DIR, SKILLS_SUBDIR, skillName, SKILL_FILE_NAME),
      basePath: projectDir.basePath,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => skillFilePath
    }

    const frontMatterData = this.buildSkillFrontMatter(skill)
    const skillContent = buildMarkdownWithFrontMatter(frontMatterData, skill.content as string)

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'projectSkill', path: skillFilePath})
      results.push({path: relativePath, success: true, skipped: false})
    } else {
      try {
        this.ensureDirectory(skillDir)
        this.writeFileSync(skillFilePath, skillContent)
        this.log.trace({action: 'write', type: 'projectSkill', path: skillFilePath})
        results.push({path: relativePath, success: true})
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        this.log.error({action: 'write', type: 'projectSkill', path: skillFilePath, error: errMsg})
        results.push({path: relativePath, success: false, error: error as Error})
      }
    }

    if (skill.childDocs != null) {
      for (const childDoc of skill.childDocs) results.push(await this.writeSkillChildDoc(ctx, childDoc, skillDir, skillName, projectDir))
    }

    if (skill.resources != null) {
      for (const resource of skill.resources) results.push(await this.writeTraeSkillResource(ctx, resource, skillDir, skillName, projectDir))
    }

    return results
  }

  private async writeSkillChildDoc(ctx: OutputWriteContext, childDoc: {relativePath: string, content: unknown}, skillDir: string, skillName: string, projectDir: RelativePath): Promise<WriteResult> {
    const outputRelativePath = childDoc.relativePath.replace(/\.mdx$/, '.md')
    const childDocPath = path.join(skillDir, outputRelativePath)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(projectDir.path, GLOBAL_CONFIG_DIR, SKILLS_SUBDIR, skillName, outputRelativePath),
      basePath: projectDir.basePath,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => childDocPath
    }

    const content = childDoc.content as string
    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'skillChildDoc', path: childDocPath})
      return {path: relativePath, success: true, skipped: false}
    }

    try {
      const parentDir = path.dirname(childDocPath)
      this.ensureDirectory(parentDir)
      this.writeFileSync(childDocPath, content)
      this.log.trace({action: 'write', type: 'skillChildDoc', path: childDocPath})
      return {path: relativePath, success: true}
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'skillChildDoc', path: childDocPath, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
  }

  private async writeTraeSkillResource(ctx: OutputWriteContext, resource: {relativePath: string, content: string, encoding: 'text' | 'base64'}, skillDir: string, skillName: string, projectDir: RelativePath): Promise<WriteResult> {
    const resourcePath = path.join(skillDir, resource.relativePath)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(projectDir.path, GLOBAL_CONFIG_DIR, SKILLS_SUBDIR, skillName, resource.relativePath),
      basePath: projectDir.basePath,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => resourcePath
    }

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'skillResource', path: resourcePath})
      return {path: relativePath, success: true, skipped: false}
    }

    try {
      const parentDir = path.dirname(resourcePath)
      this.ensureDirectory(parentDir)
      if (resource.encoding === 'base64') {
        const buffer = Buffer.from(resource.content, 'base64')
        this.writeFileSyncBuffer(resourcePath, buffer)
      } else this.writeFileSync(resourcePath, resource.content)
      this.log.trace({action: 'write', type: 'skillResource', path: resourcePath})
      return {path: relativePath, success: true}
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'skillResource', path: resourcePath, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
  }

  protected override buildSkillFrontMatter(skill: SkillPrompt): Record<string, unknown> {
    const fm: Record<string, unknown> = {
      description: skill.yamlFrontMatter.description ?? ''
    }

    if (skill.yamlFrontMatter.displayName != null) fm['name'] = skill.yamlFrontMatter.displayName

    return fm
  }

  private buildSteeringFileName(child: ProjectChildrenMemoryPrompt): string {
    const childPath = child.workingChildDirectoryPath?.path ?? child.dir.path
    const normalized = childPath.replaceAll('\\', '/').replaceAll(/^\/+|\/+$/g, '').replaceAll('/', '-')
    return `trae-${normalized}.md`
  }

  private async writeSteeringFile(ctx: OutputWriteContext, project: Project, child: ProjectChildrenMemoryPrompt): Promise<WriteResult> {
    const projectDir = project.dirFromWorkspacePath!
    const fileName = this.buildSteeringFileName(child)
    const targetDir = this.joinPath(projectDir.basePath, projectDir.path, GLOBAL_CONFIG_DIR, RULES_SUBDIR)
    const fullPath = this.joinPath(targetDir, fileName)

    const childPath = child.workingChildDirectoryPath?.path ?? child.dir.path
    const globPattern = `${childPath.replaceAll('\\', '/')}/**`

    const content = [
      '---',
      'alwaysApply: false',
      `globs: ${globPattern}`,
      '---',
      '',
      child.content
    ].join('\n')

    return this.writeFile(ctx, fullPath, content, 'steeringFile')
  }
}
