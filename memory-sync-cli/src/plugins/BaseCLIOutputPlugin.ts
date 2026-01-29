import type {AbstractOutputPluginOptions} from './AbstractOutputPlugin'
import type {FastCommandPrompt, OutputPluginContext, OutputWriteContext, SkillPrompt, SubAgentPrompt, WriteResult, WriteResults} from '@/types'
import type {RelativePath} from '@/types/FileSystemTypes'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {mdxToMd} from '@/compiler'
import {GlobalScopeCollector} from '@/scope'
import {FilePathKind} from '@/types'
import {AbstractOutputPlugin} from './AbstractOutputPlugin'

export interface BaseCLIOutputPluginOptions extends AbstractOutputPluginOptions {
  readonly commandsSubDir?: string
  readonly agentsSubDir?: string
  readonly skillsSubDir?: string

  readonly supportsFastCommands?: boolean

  readonly supportsSubAgents?: boolean

  readonly supportsSkills?: boolean

  readonly toolPreset?: string
}

export abstract class BaseCLIOutputPlugin extends AbstractOutputPlugin {
  protected readonly commandsSubDir: string
  protected readonly agentsSubDir: string
  protected readonly skillsSubDir: string
  protected readonly supportsFastCommands: boolean
  protected readonly supportsSubAgents: boolean
  protected readonly supportsSkills: boolean
  protected readonly toolPreset?: string

  constructor(name: string, options: BaseCLIOutputPluginOptions) {
    super(name, options)
    this.commandsSubDir = options.commandsSubDir ?? 'commands'
    this.agentsSubDir = options.agentsSubDir ?? 'agents'
    this.skillsSubDir = options.skillsSubDir ?? 'skills'
    this.supportsFastCommands = options.supportsFastCommands ?? true
    this.supportsSubAgents = options.supportsSubAgents ?? true
    this.supportsSkills = options.supportsSkills ?? true
    if (options.toolPreset !== void 0) this.toolPreset = options.toolPreset
  }

  async registerGlobalOutputDirs(_ctx: OutputPluginContext): Promise<RelativePath[]> {
    const globalDir = this.getGlobalConfigDir()
    const results: RelativePath[] = []
    const subdirs: string[] = []

    if (this.supportsFastCommands) subdirs.push(this.commandsSubDir)
    if (this.supportsSubAgents) subdirs.push(this.agentsSubDir)
    if (this.supportsSkills) subdirs.push(this.skillsSubDir)

    for (const subdir of subdirs) {
      const fullPath = path.join(globalDir, subdir)
      results.push({
        pathKind: FilePathKind.Relative,
        path: subdir,
        basePath: globalDir,
        getDirectoryName: () => subdir,
        getAbsolutePath: () => fullPath
      })
    }

    return results
  }

  async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {projects} = ctx.collectedInputContext.workspace

    const subdirs: string[] = [] // Subdirectories might be needed there too // Most CLI tools store project-local config in a hidden folder .toolname
    if (this.supportsFastCommands) subdirs.push(this.commandsSubDir)
    if (this.supportsSubAgents) subdirs.push(this.agentsSubDir)
    if (this.supportsSkills) subdirs.push(this.skillsSubDir)

    if (subdirs.length === 0) return []

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) continue

      for (const subdir of subdirs) {
        const dirPath = path.join(project.dirFromWorkspacePath.path, this.globalConfigDir, subdir) // Assuming globalConfigDir is something like .claude
        results.push({
          pathKind: FilePathKind.Relative,
          path: dirPath,
          basePath: project.dirFromWorkspacePath.basePath,
          getDirectoryName: () => subdir,
          getAbsolutePath: () => path.join(project.dirFromWorkspacePath!.basePath, dirPath)
        })
      }
    }

    return results
  }

  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {projects} = ctx.collectedInputContext.workspace

    for (const project of projects) {
      if (project.rootMemoryPrompt != null && project.dirFromWorkspacePath != null) { // Root memory file
        results.push(this.createFileRelativePath(project.dirFromWorkspacePath, this.outputFileName))
      }

      if (project.childMemoryPrompts != null) { // Child memory files
        for (const child of project.childMemoryPrompts) {
          if (child.dir != null && this.isRelativePath(child.dir)) results.push(this.createFileRelativePath(child.dir, this.outputFileName))
        }
      }
    }

    return results
  }

  async registerGlobalOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const {globalMemory} = ctx.collectedInputContext
    if (globalMemory == null) return []

    const globalDir = this.getGlobalConfigDir()
    const results: RelativePath[] = [
      {
        pathKind: FilePathKind.Relative,
        path: this.outputFileName,
        basePath: globalDir,
        getDirectoryName: () => this.globalConfigDir,
        getAbsolutePath: () => path.join(globalDir, this.outputFileName)
      }
    ]

    const {fastCommands, subAgents, skills} = ctx.collectedInputContext
    const transformOptions = {includeSeriesPrefix: true} as const

    if (this.supportsFastCommands && fastCommands != null) {
      for (const cmd of fastCommands) {
        const fileName = this.transformFastCommandName(cmd, transformOptions)
        const fullPath = path.join(globalDir, this.commandsSubDir, fileName)
        results.push({
          pathKind: FilePathKind.Relative,
          path: path.join(this.commandsSubDir, fileName),
          basePath: globalDir,
          getDirectoryName: () => this.commandsSubDir,
          getAbsolutePath: () => fullPath
        })
      }
    }

    if (this.supportsSubAgents && subAgents != null) {
      for (const agent of subAgents) {
        const fileName = agent.dir.path.endsWith('.md') ? agent.dir.path : `${agent.dir.path}.md`
        const fullPath = path.join(globalDir, this.agentsSubDir, fileName)
        results.push({
          pathKind: FilePathKind.Relative,
          path: path.join(this.agentsSubDir, fileName),
          basePath: globalDir,
          getDirectoryName: () => this.agentsSubDir,
          getAbsolutePath: () => fullPath
        })
      }
    }

    if (this.supportsSkills && skills != null) {
      for (const skill of skills) {
        const skillName = skill.yamlFrontMatter?.name ?? skill.dir.getDirectoryName()
        const skillDir = path.join(this.skillsSubDir, skillName)

        results.push({
          pathKind: FilePathKind.Relative,
          path: path.join(skillDir, 'SKILL.md'),
          basePath: globalDir,
          getDirectoryName: () => skillName,
          getAbsolutePath: () => path.join(globalDir, skillDir, 'SKILL.md')
        })

        if (skill.childDocs != null) {
          for (const refDoc of skill.childDocs) {
            const refDocFileName = refDoc.dir.path.replace(/\.mdx$/, '.md')
            const refDocPath = path.join(skillDir, refDocFileName)
            results.push({
              pathKind: FilePathKind.Relative,
              path: refDocPath,
              basePath: globalDir,
              getDirectoryName: () => skillName,
              getAbsolutePath: () => path.join(globalDir, refDocPath)
            })
          }
        }

        if (skill.resources != null) {
          for (const resource of skill.resources) {
            const resourcePath = path.join(skillDir, resource.relativePath)
            results.push({
              pathKind: FilePathKind.Relative,
              path: resourcePath,
              basePath: globalDir,
              getDirectoryName: () => skillName,
              getAbsolutePath: () => path.join(globalDir, resourcePath)
            })
          }
        }
      }
    }

    return results
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {workspace, globalMemory, fastCommands, subAgents, skills} = ctx.collectedInputContext
    const hasProjectOutputs = workspace.projects.some(
      p => p.rootMemoryPrompt != null || (p.childMemoryPrompts?.length ?? 0) > 0
    )
    const hasGlobalMemory = globalMemory != null
    const hasFastCommands = this.supportsFastCommands && (fastCommands?.length ?? 0) > 0
    const hasSubAgents = this.supportsSubAgents && (subAgents?.length ?? 0) > 0
    const hasSkills = this.supportsSkills && (skills?.length ?? 0) > 0

    if (hasProjectOutputs || hasGlobalMemory || hasFastCommands || hasSubAgents || hasSkills) return true

    this.log.trace({action: 'skip', reason: 'noOutputs'})
    return false
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {projects} = ctx.collectedInputContext.workspace
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    for (const project of projects) {
      const projectName = project.name ?? 'unknown'
      const projectDir = project.dirFromWorkspacePath

      if (projectDir == null) continue

      if (project.rootMemoryPrompt != null) {
        const result = await this.writePromptFile(ctx, projectDir, project.rootMemoryPrompt.content as string, `project:${projectName}/root`)
        fileResults.push(result)
      }

      if (project.childMemoryPrompts != null) {
        for (const child of project.childMemoryPrompts) {
          const childResult = await this.writePromptFile(ctx, child.dir, child.content as string, `project:${projectName}/child:${child.workingChildDirectoryPath?.path ?? 'unknown'}`)
          fileResults.push(childResult)
        }
      }
    }

    return {files: fileResults, dirs: dirResults}
  }

  async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {globalMemory} = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    const checkList = [
      {enabled: true, data: globalMemory},
      {enabled: this.supportsFastCommands, data: ctx.collectedInputContext.fastCommands},
      {enabled: this.supportsSubAgents, data: ctx.collectedInputContext.subAgents},
      {enabled: this.supportsSkills, data: ctx.collectedInputContext.skills}
    ]

    if (checkList.every(item => !item.enabled || item.data == null)) return {files: fileResults, dirs: dirResults}

    const {fastCommands, subAgents, skills} = ctx.collectedInputContext
    const globalDir = this.getGlobalConfigDir()

    if (globalMemory != null) { // Write Global Memory File
      const fullPath = path.join(globalDir, this.outputFileName)
      const relativePath: RelativePath = {
        pathKind: FilePathKind.Relative,
        path: this.outputFileName,
        basePath: globalDir,
        getDirectoryName: () => this.globalConfigDir,
        getAbsolutePath: () => fullPath
      }

      if (ctx.dryRun === true) {
        this.log.trace({action: 'dryRun', type: 'globalMemory', path: fullPath})
        fileResults.push({
          path: relativePath,
          success: true,
          skipped: false
        })
      } else {
        try {
          this.ensureDirectory(globalDir)
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

    if (this.supportsFastCommands && fastCommands != null) {
      for (const cmd of fastCommands) {
        const cmdResults = await this.writeFastCommand(ctx, globalDir, cmd)
        fileResults.push(...cmdResults)
      }
    }

    if (this.supportsSubAgents && subAgents != null) {
      for (const agent of subAgents) {
        const agentResults = await this.writeSubAgent(ctx, globalDir, agent)
        fileResults.push(...agentResults)
      }
    }

    if (this.supportsSkills && skills != null) {
      for (const skill of skills) {
        const skillResults = await this.writeSkill(ctx, globalDir, skill)
        fileResults.push(...skillResults)
      }
    }

    return {files: fileResults, dirs: dirResults}
  }

  protected async writeFastCommand(
    ctx: OutputWriteContext,
    basePath: string,
    cmd: FastCommandPrompt
  ): Promise<WriteResult[]> {
    const transformOptions = this.getTransformOptionsFromContext(ctx)
    const fileName = this.transformFastCommandName(cmd, transformOptions)
    const targetDir = path.join(basePath, this.commandsSubDir)
    const fullPath = path.join(targetDir, fileName)

    let compiledContent = cmd.content
    let compiledFrontMatter = cmd.yamlFrontMatter
    let useRecompiledFrontMatter = false

    if (cmd.rawMdxContent != null && this.toolPreset != null) { // Only recompile if we have raw content AND a tool preset is configured
      this.log.debug('recompiling fast command with tool preset', {
        file: cmd.dir.getAbsolutePath(),
        toolPreset: this.toolPreset,
        hasRawContent: true
      })
      try {
        // eslint-disable-next-line ts/no-unsafe-assignment
        const scopeCollector = new GlobalScopeCollector({toolPreset: this.toolPreset as any}) // Cast to clean
        const globalScope = scopeCollector.collect()
        const result = await mdxToMd(cmd.rawMdxContent, {globalScope, extractMetadata: true, basePath: cmd.dir.basePath})
        compiledContent = result.content
        compiledFrontMatter = result.metadata.fields as typeof cmd.yamlFrontMatter
        useRecompiledFrontMatter = true
      }
      catch (e) {
        this.log.warn('failed to recompile fast command, using default', {
          file: cmd.dir.getAbsolutePath(),
          error: e instanceof Error ? e.message : String(e)
        })
      }
    }

    const content = useRecompiledFrontMatter
      ? this.buildMarkdownContent(compiledContent, compiledFrontMatter)
      : this.buildMarkdownContentWithRaw(compiledContent, compiledFrontMatter, cmd.rawFrontMatter)

    return [await this.writeFile(ctx, fullPath, content, 'fastCommand')]
  }

  protected async writeSubAgent(
    ctx: OutputWriteContext,
    basePath: string,
    agent: SubAgentPrompt
  ): Promise<WriteResult[]> {
    const fileName = agent.dir.path.endsWith('.md') ? agent.dir.path : `${agent.dir.path}.md`
    const targetDir = path.join(basePath, this.agentsSubDir)
    const fullPath = path.join(targetDir, fileName)

    const content = this.buildMarkdownContentWithRaw(
      agent.content,
      agent.yamlFrontMatter,
      agent.rawFrontMatter
    )

    return [await this.writeFile(ctx, fullPath, content, 'subAgent')]
  }

  protected async writeSkill(
    ctx: OutputWriteContext,
    basePath: string,
    skill: SkillPrompt
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const skillName = skill.yamlFrontMatter?.name ?? skill.dir.getDirectoryName()
    const targetDir = path.join(basePath, this.skillsSubDir, skillName)
    const fullPath = path.join(targetDir, 'SKILL.md')

    const content = this.buildMarkdownContentWithRaw(
      skill.content as string,
      skill.yamlFrontMatter,
      skill.rawFrontMatter
    )

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

  protected async writeSkillReferenceDocument(
    ctx: OutputWriteContext,
    skillDir: string,
    _skillName: string,
    refDoc: {dir: RelativePath, content: unknown},
    _basePath: string
  ): Promise<WriteResult[]> {
    const fileName = refDoc.dir.path.replace(/\.mdx$/, '.md')
    const fullPath = path.join(skillDir, fileName)
    return [await this.writeFile(ctx, fullPath, refDoc.content as string, 'skillRefDoc')]
  }

  protected async writeSkillResource(
    ctx: OutputWriteContext,
    skillDir: string,
    _skillName: string,
    resource: {relativePath: string, content: string},
    _basePath: string
  ): Promise<WriteResult[]> {
    const fullPath = path.join(skillDir, resource.relativePath)
    return [await this.writeFile(ctx, fullPath, resource.content, 'skillResource')]
  }
}
