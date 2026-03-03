import type {
  CommandPrompt,
  OutputPluginContext,
  OutputWriteContext,
  RulePrompt,
  RuleScope,
  SkillPrompt,
  SubAgentPrompt,
  WriteResult,
  WriteResults
} from '../plugin-shared'
import type {RelativePath} from '../plugin-shared/types'
import type {AbstractOutputPluginOptions} from './AbstractOutputPlugin'
import * as path from 'node:path'
import {writeFileSync as deskWriteFileSync} from '@truenine/desk-paths'
import {mdxToMd} from '@truenine/md-compiler'
import {GlobalScopeCollector} from '@truenine/plugin-input-shared'
import {AbstractOutputPlugin} from './AbstractOutputPlugin'
import {filterCommandsByProjectConfig, filterSkillsByProjectConfig, filterSubAgentsByProjectConfig} from './utils'

export interface BaseCLIOutputPluginOptions extends AbstractOutputPluginOptions {
  readonly commandsSubDir?: string
  readonly agentsSubDir?: string
  readonly skillsSubDir?: string

  readonly supportsCommands?: boolean

  readonly supportsSubAgents?: boolean

  readonly supportsSkills?: boolean

  readonly toolPreset?: string
}

export abstract class BaseCLIOutputPlugin extends AbstractOutputPlugin {
  protected readonly commandsSubDir: string
  protected readonly agentsSubDir: string
  protected readonly skillsSubDir: string
  protected readonly supportsCommands: boolean
  protected readonly supportsSubAgents: boolean
  protected readonly supportsSkills: boolean
  protected readonly toolPreset?: string

  constructor(name: string, options: BaseCLIOutputPluginOptions) {
    super(name, options)
    this.commandsSubDir = options.commandsSubDir ?? 'commands'
    this.agentsSubDir = options.agentsSubDir ?? 'agents'
    this.skillsSubDir = options.skillsSubDir ?? 'skills'
    this.supportsCommands = options.supportsCommands ?? true
    this.supportsSubAgents = options.supportsSubAgents ?? true
    this.supportsSkills = options.supportsSkills ?? true
    if (options.toolPreset !== void 0) this.toolPreset = options.toolPreset
  }

  async registerGlobalOutputDirs(_ctx: OutputPluginContext): Promise<RelativePath[]> {
    return []
  }

  async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {projects} = ctx.collectedInputContext.workspace

    const subdirs: string[] = [] // Subdirectories might be needed there too // Most CLI tools store project-local config in a hidden folder .toolname
    if (this.supportsCommands) subdirs.push(this.commandsSubDir)
    if (this.supportsSubAgents) subdirs.push(this.agentsSubDir)
    if (this.supportsSkills) subdirs.push(this.skillsSubDir)

    this.log.debug('registerProjectOutputDirs', {
      plugin: this.name,
      projectCount: projects.length,
      supportsCommands: this.supportsCommands,
      supportsSubAgents: this.supportsSubAgents,
      supportsSkills: this.supportsSkills,
      subdirs,
      commandsCount: ctx.collectedInputContext.commands?.length ?? 0,
      subAgentsCount: ctx.collectedInputContext.subAgents?.length ?? 0,
      skillsCount: ctx.collectedInputContext.skills?.length ?? 0
    })

    if (subdirs.length === 0) {
      this.log.debug('no subdirs to register', {plugin: this.name})
      return []
    }

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) {
        this.log.debug('project has no dirFromWorkspacePath', {plugin: this.name, projectName: project.name})
        continue
      }

      for (const subdir of subdirs) {
        const dirPath = path.join(project.dirFromWorkspacePath.path, this.globalConfigDir, subdir) // Assuming globalConfigDir is something like .claude
        results.push(this.createRelativePath(dirPath, project.dirFromWorkspacePath.basePath, () => subdir))
        this.log.debug('registered output dir', {plugin: this.name, project: project.name, subdir, dirPath})
      }
    }

    this.log.debug('registerProjectOutputDirs complete', {plugin: this.name, dirCount: results.length})
    return results
  }

  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {projects} = ctx.collectedInputContext.workspace

    this.log.debug('registerProjectOutputFiles start', {
      plugin: this.name,
      projectCount: projects.length,
      commandsAvailable: ctx.collectedInputContext.commands != null,
      commandsCount: ctx.collectedInputContext.commands?.length ?? 0,
      subAgentsAvailable: ctx.collectedInputContext.subAgents != null,
      subAgentsCount: ctx.collectedInputContext.subAgents?.length ?? 0,
      skillsAvailable: ctx.collectedInputContext.skills != null,
      skillsCount: ctx.collectedInputContext.skills?.length ?? 0
    })

    for (const project of projects) {
      this.log.debug('processing project', {
        plugin: this.name,
        projectName: project.name,
        hasRootMemory: project.rootMemoryPrompt != null,
        childMemoryCount: project.childMemoryPrompts?.length ?? 0,
        hasDirFromWorkspace: project.dirFromWorkspacePath != null,
        projectConfig: project.projectConfig
      })

      if (project.rootMemoryPrompt != null && project.dirFromWorkspacePath != null) { // Root memory file
        results.push(this.createFileRelativePath(project.dirFromWorkspacePath, this.outputFileName))
      }

      if (project.childMemoryPrompts != null) { // Child memory files
        for (const child of project.childMemoryPrompts) {
          if (child.dir != null && this.isRelativePath(child.dir)) results.push(this.createFileRelativePath(child.dir, this.outputFileName))
        }
      }

      if (project.dirFromWorkspacePath == null) {
        this.log.debug('project has no dirFromWorkspacePath, skipping', {plugin: this.name, projectName: project.name})
        continue
      }

      const {projectConfig} = project
      const basePath = path.join(project.dirFromWorkspacePath.path, this.globalConfigDir)
      const transformOptions = {includeSeriesPrefix: true} as const

      if (this.supportsCommands && ctx.collectedInputContext.commands != null) {
        const allCommands = ctx.collectedInputContext.commands
        const filteredCommands = filterCommandsByProjectConfig(allCommands, projectConfig)
        this.log.debug('filtering commands', {
          plugin: this.name,
          projectName: project.name,
          totalCommands: allCommands.length,
          filteredCommands: filteredCommands.length,
          projectConfig
        })
        for (const cmd of filteredCommands) {
          const fileName = this.transformCommandName(cmd, transformOptions)
          results.push(this.createRelativePath(path.join(basePath, this.commandsSubDir, fileName), project.dirFromWorkspacePath.basePath, () => this.commandsSubDir))
          this.log.debug('registered command file', {plugin: this.name, project: project.name, fileName})
        }
      } else {
        this.log.debug('commands skipped', {
          plugin: this.name,
          supportsCommands: this.supportsCommands,
          hasCommands: ctx.collectedInputContext.commands != null
        })
      }

      if (this.supportsSubAgents && ctx.collectedInputContext.subAgents != null) {
        const allSubAgents = ctx.collectedInputContext.subAgents
        const filteredSubAgents = filterSubAgentsByProjectConfig(allSubAgents, projectConfig)
        this.log.debug('filtering subAgents', {
          plugin: this.name,
          projectName: project.name,
          totalSubAgents: allSubAgents.length,
          filteredSubAgents: filteredSubAgents.length,
          projectConfig
        })
        for (const agent of filteredSubAgents) {
          const fileName = agent.dir.path.replace(/\.mdx$/, '.md')
          results.push(this.createRelativePath(path.join(basePath, this.agentsSubDir, fileName), project.dirFromWorkspacePath.basePath, () => this.agentsSubDir))
          this.log.debug('registered agent file', {plugin: this.name, project: project.name, fileName})
        }
      } else {
        this.log.debug('subAgents skipped', {
          plugin: this.name,
          supportsSubAgents: this.supportsSubAgents,
          hasSubAgents: ctx.collectedInputContext.subAgents != null
        })
      }

      if (this.supportsSkills && ctx.collectedInputContext.skills != null) {
        const allSkills = ctx.collectedInputContext.skills
        const filteredSkills = filterSkillsByProjectConfig(allSkills, projectConfig)
        this.log.debug('filtering skills', {
          plugin: this.name,
          projectName: project.name,
          totalSkills: allSkills.length,
          filteredSkills: filteredSkills.length
        })
        for (const skill of filteredSkills) {
          const skillName = skill.yamlFrontMatter?.name ?? skill.dir.getDirectoryName()
          const skillDir = path.join(basePath, this.skillsSubDir, skillName)

          results.push(this.createRelativePath(path.join(skillDir, 'SKILL.md'), project.dirFromWorkspacePath.basePath, () => skillName))

          if (skill.childDocs != null) {
            for (const refDoc of skill.childDocs) {
              const refDocFileName = refDoc.dir.path.replace(/\.mdx$/, '.md')
              const refDocPath = path.join(skillDir, refDocFileName)
              results.push(this.createRelativePath(refDocPath, project.dirFromWorkspacePath.basePath, () => skillName))
            }
          }

          if (skill.resources != null) {
            for (const resource of skill.resources) {
              const resourcePath = path.join(skillDir, resource.relativePath)
              results.push(this.createRelativePath(resourcePath, project.dirFromWorkspacePath.basePath, () => skillName))
            }
          }
        }
      } else {
        this.log.debug('skills skipped', {
          plugin: this.name,
          supportsSkills: this.supportsSkills,
          hasSkills: ctx.collectedInputContext.skills != null
        })
      }
    }

    this.log.debug('registerProjectOutputFiles complete', {plugin: this.name, fileCount: results.length})
    return results
  }

  async registerGlobalOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const {globalMemory} = ctx.collectedInputContext
    if (globalMemory == null) return []

    const globalDir = this.getGlobalConfigDir()
    return [
      this.createRelativePath(this.outputFileName, globalDir, () => this.globalConfigDir)
    ]
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {workspace, globalMemory, commands, subAgents, skills} = ctx.collectedInputContext
    const hasProjectOutputs = workspace.projects.some(
      p => p.rootMemoryPrompt != null || (p.childMemoryPrompts?.length ?? 0) > 0
    )
    const hasGlobalMemory = globalMemory != null
    const hasProjectLevelCommands = this.supportsCommands && (commands?.length ?? 0) > 0 && workspace.projects.length > 0
    const hasProjectLevelSubAgents = this.supportsSubAgents && (subAgents?.length ?? 0) > 0 && workspace.projects.length > 0
    const hasProjectLevelSkills = this.supportsSkills && (skills?.length ?? 0) > 0 && workspace.projects.length > 0

    this.log.debug('canWrite check', {
      plugin: this.name,
      hasProjectOutputs,
      hasGlobalMemory,
      hasProjectLevelCommands,
      hasProjectLevelSubAgents,
      hasProjectLevelSkills,
      projectCount: workspace.projects.length,
      commandsCount: commands?.length ?? 0,
      subAgentsCount: subAgents?.length ?? 0,
      skillsCount: skills?.length ?? 0,
      supportsCommands: this.supportsCommands,
      supportsSubAgents: this.supportsSubAgents,
      supportsSkills: this.supportsSkills
    })

    if (hasProjectOutputs || hasGlobalMemory || hasProjectLevelCommands || hasProjectLevelSubAgents || hasProjectLevelSkills) return true

    this.log.trace({action: 'skip', reason: 'noOutputs'})
    return false
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {projects} = ctx.collectedInputContext.workspace
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    this.log.debug('writeProjectOutputs start', {
      plugin: this.name,
      projectCount: projects.length,
      commandsCount: ctx.collectedInputContext.commands?.length ?? 0,
      subAgentsCount: ctx.collectedInputContext.subAgents?.length ?? 0,
      skillsCount: ctx.collectedInputContext.skills?.length ?? 0
    })

    for (const project of projects) {
      const projectName = project.name ?? 'unknown'
      const projectDir = project.dirFromWorkspacePath

      this.log.debug('writing project outputs', {
        plugin: this.name,
        projectName,
        hasProjectDir: projectDir != null,
        projectConfig: project.projectConfig
      })

      if (projectDir == null) {
        this.log.debug('project has no dirFromWorkspacePath, skipping', {plugin: this.name, projectName})
        continue
      }

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

      const {projectConfig} = project
      const basePath = path.join(projectDir.basePath, projectDir.path, this.globalConfigDir)

      if (this.supportsCommands && ctx.collectedInputContext.commands != null) {
        const allCommands = ctx.collectedInputContext.commands
        const filteredCommands = filterCommandsByProjectConfig(allCommands, projectConfig)
        this.log.debug('writing commands', {
          plugin: this.name,
          projectName,
          totalCommands: allCommands.length,
          filteredCommands: filteredCommands.length,
          projectConfig
        })
        for (const cmd of filteredCommands) {
          const cmdResults = await this.writeCommand(ctx, basePath, cmd)
          fileResults.push(...cmdResults)
          this.log.debug('wrote command', {plugin: this.name, projectName, commandName: cmd.commandName, success: cmdResults.every(r => r.success)})
        }
      } else {
        this.log.debug('commands not written', {
          plugin: this.name,
          supportsCommands: this.supportsCommands,
          hasCommands: ctx.collectedInputContext.commands != null
        })
      }

      if (this.supportsSubAgents && ctx.collectedInputContext.subAgents != null) {
        const allSubAgents = ctx.collectedInputContext.subAgents
        const filteredSubAgents = filterSubAgentsByProjectConfig(allSubAgents, projectConfig)
        this.log.debug('writing subAgents', {
          plugin: this.name,
          projectName,
          totalSubAgents: allSubAgents.length,
          filteredSubAgents: filteredSubAgents.length,
          projectConfig
        })
        for (const agent of filteredSubAgents) {
          const agentResults = await this.writeSubAgent(ctx, basePath, agent)
          fileResults.push(...agentResults)
          this.log.debug('wrote subAgent', {plugin: this.name, projectName, agentPath: agent.dir.path, success: agentResults.every(r => r.success)})
        }
      } else {
        this.log.debug('subAgents not written', {
          plugin: this.name,
          supportsSubAgents: this.supportsSubAgents,
          hasSubAgents: ctx.collectedInputContext.subAgents != null
        })
      }

      if (this.supportsSkills && ctx.collectedInputContext.skills != null) {
        const allSkills = ctx.collectedInputContext.skills
        const filteredSkills = filterSkillsByProjectConfig(allSkills, projectConfig)
        this.log.debug('writing skills', {
          plugin: this.name,
          projectName,
          totalSkills: allSkills.length,
          filteredSkills: filteredSkills.length
        })
        for (const skill of filteredSkills) {
          const skillResults = await this.writeSkill(ctx, basePath, skill)
          fileResults.push(...skillResults)
          this.log.debug('wrote skill', {plugin: this.name, projectName, skillName: skill.yamlFrontMatter?.name, success: skillResults.every(r => r.success)})
        }
      } else {
        this.log.debug('skills not written', {
          plugin: this.name,
          supportsSkills: this.supportsSkills,
          hasSkills: ctx.collectedInputContext.skills != null
        })
      }
    }

    return {files: fileResults, dirs: dirResults}
  }

  async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {globalMemory} = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    if (globalMemory == null) return {files: fileResults, dirs: dirResults}

    const globalDir = this.getGlobalConfigDir()
    const fullPath = path.join(globalDir, this.outputFileName)
    const relativePath: RelativePath = this.createRelativePath(this.outputFileName, globalDir, () => this.globalConfigDir)

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'globalMemory', path: fullPath})
      fileResults.push({
        path: relativePath,
        success: true,
        skipped: false
      })
    } else {
      try {
        deskWriteFileSync(fullPath, globalMemory.content as string)
        this.log.trace({action: 'write', type: 'globalMemory', path: fullPath})
        fileResults.push({path: relativePath, success: true})
      }
      catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        this.log.error({action: 'write', type: 'globalMemory', path: fullPath, error: errMsg})
        fileResults.push({path: relativePath, success: false, error: error as Error})
      }
    }

    return {files: fileResults, dirs: dirResults}
  }

  protected async writeCommand(
    ctx: OutputWriteContext,
    basePath: string,
    cmd: CommandPrompt
  ): Promise<WriteResult[]> {
    const transformOptions = this.getTransformOptionsFromContext(ctx)
    const fileName = this.transformCommandName(cmd, transformOptions)
    const targetDir = path.join(basePath, this.commandsSubDir)
    const fullPath = path.join(targetDir, fileName)

    let compiledContent = cmd.content
    let compiledFrontMatter = cmd.yamlFrontMatter
    let useRecompiledFrontMatter = false

    if (cmd.rawMdxContent != null && this.toolPreset != null) { // Only recompile if we have raw content AND a tool preset is configured
      this.log.debug('recompiling command with tool preset', {
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
        this.log.warn('failed to recompile command, using default', {
          file: cmd.dir.getAbsolutePath(),
          error: e instanceof Error ? e.message : String(e)
        })
      }
    }

    const content = useRecompiledFrontMatter
      ? this.buildMarkdownContent(compiledContent, compiledFrontMatter)
      : this.buildMarkdownContentWithRaw(compiledContent, compiledFrontMatter, cmd.rawFrontMatter)

    return [await this.writeFile(ctx, fullPath, content, 'command')]
  }

  protected async writeSubAgent(
    ctx: OutputWriteContext,
    basePath: string,
    agent: SubAgentPrompt
  ): Promise<WriteResult[]> {
    const fileName = agent.dir.path.replace(/\.mdx$/, '.md')
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

  protected override normalizeRuleScope(rule: RulePrompt): RuleScope {
    return rule.scope ?? 'project'
  }
}
