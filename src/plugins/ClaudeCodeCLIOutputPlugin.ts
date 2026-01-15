import type {
  FastCommandPrompt,
  OutputPluginContext,
  OutputWriteContext,
  SkillPrompt,
  SubAgentPrompt,
  WriteResult,
  WriteResults,
} from '@/types'
import type {RelativePath} from '@/types/FileSystemTypes'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {mdxToMd} from '@/compiler'
import {GlobalScopeCollector} from '@/scope'
import {FilePathKind} from '@/types'
import {AbstractOutputPlugin} from './AbstractOutputPlugin'

const PROJECT_MEMORY_FILE = 'CLAUDE.md'
const GLOBAL_CONFIG_DIR = '.claude'
const COMMANDS_SUBDIR = 'commands'
const AGENTS_SUBDIR = 'agents'
const SKILLS_SUBDIR = 'skills'

const CLEANUP_SUBDIRS = [COMMANDS_SUBDIR, AGENTS_SUBDIR, SKILLS_SUBDIR] as const // Directories to clean under .claude/

export class ClaudeCodeCLIOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('ClaudeCodeCLIOutputPlugin', {globalConfigDir: GLOBAL_CONFIG_DIR, outputFileName: PROJECT_MEMORY_FILE})
  }

  async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {projects} = ctx.collectedInputContext.workspace

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) continue

      for (const subdir of CLEANUP_SUBDIRS) { // Register .claude/commands, .claude/agents, .claude/skills for cleanup
        const dirPath = path.join(project.dirFromWorkspacePath.path, GLOBAL_CONFIG_DIR, subdir)
        results.push({
          pathKind: FilePathKind.Relative,
          path: dirPath,
          basePath: project.dirFromWorkspacePath.basePath,
          getDirectoryName: () => subdir,
          getAbsolutePath: () => path.join(project.dirFromWorkspacePath!.basePath, dirPath),
        })
      }
    }

    return results
  }

  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {projects} = ctx.collectedInputContext.workspace
    const {skills} = ctx.collectedInputContext

    for (const project of projects) {
      if (project.rootMemoryPrompt != null && project.dirFromWorkspacePath != null) { // Root memory prompt uses project.dirFromWorkspacePath
        results.push(this.createFileRelativePath(project.dirFromWorkspacePath, PROJECT_MEMORY_FILE))
      }

      if (project.childMemoryPrompts != null) {
        for (const child of project.childMemoryPrompts) {
          if (child.dir != null && this.isRelativePath(child.dir)) results.push(this.createFileRelativePath(child.dir, PROJECT_MEMORY_FILE))
        }
      }

      if (skills != null && project.dirFromWorkspacePath != null) { // Register skill files (SKILL.md, reference docs, and resources)
        for (const skill of skills) {
          const skillName = skill.yamlFrontMatter?.name ?? skill.dir.getDirectoryName()
          const skillDir = path.join(project.dirFromWorkspacePath.path, GLOBAL_CONFIG_DIR, SKILLS_SUBDIR, skillName)

          results.push({ // Register SKILL.md
            pathKind: FilePathKind.Relative,
            path: path.join(skillDir, 'SKILL.md'),
            basePath: project.dirFromWorkspacePath.basePath,
            getDirectoryName: () => skillName,
            getAbsolutePath: () => path.join(project.dirFromWorkspacePath!.basePath, skillDir, 'SKILL.md'),
          })

          if (skill.childDocs != null) { // Register reference documents (convert .mdx to .md)
            for (const refDoc of skill.childDocs) {
              const refDocFileName = refDoc.dir.path.replace(/\.mdx$/, '.md')
              const refDocPath = path.join(skillDir, refDocFileName)
              results.push({
                pathKind: FilePathKind.Relative,
                path: refDocPath,
                basePath: project.dirFromWorkspacePath.basePath,
                getDirectoryName: () => skillName,
                getAbsolutePath: () => path.join(project.dirFromWorkspacePath!.basePath, refDocPath),
              })
            }
          }

          if (skill.resources != null) { // Register resource files
            for (const resource of skill.resources) {
              const resourcePath = path.join(skillDir, resource.relativePath)
              results.push({
                pathKind: FilePathKind.Relative,
                path: resourcePath,
                basePath: project.dirFromWorkspacePath.basePath,
                getDirectoryName: () => skillName,
                getAbsolutePath: () => path.join(project.dirFromWorkspacePath!.basePath, resourcePath),
              })
            }
          }
        }
      }
    }

    return results
  }

  async registerGlobalOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const {globalMemory} = ctx.collectedInputContext
    if (globalMemory == null) return []

    const globalDir = this.getGlobalConfigDir()
    return [
      {
        pathKind: FilePathKind.Relative,
        path: PROJECT_MEMORY_FILE,
        basePath: globalDir,
        getDirectoryName: () => GLOBAL_CONFIG_DIR,
        getAbsolutePath: () => path.join(globalDir, PROJECT_MEMORY_FILE),
      },
    ]
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {workspace, globalMemory, fastCommands, subAgents, skills} = ctx.collectedInputContext
    const hasProjectOutputs = workspace.projects.some(
      p => p.rootMemoryPrompt != null || (p.childMemoryPrompts?.length ?? 0) > 0,
    )
    const hasGlobalMemory = globalMemory != null
    const hasFastCommands = (fastCommands?.length ?? 0) > 0
    const hasSubAgents = (subAgents?.length ?? 0) > 0
    const hasSkills = (skills?.length ?? 0) > 0

    if (hasProjectOutputs || hasGlobalMemory || hasFastCommands || hasSubAgents || hasSkills) return true

    this.log.trace({action: 'skip', reason: 'noOutputs'})
    return false
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {projects} = ctx.collectedInputContext.workspace
    const {fastCommands, subAgents, skills} = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    for (const project of projects) {
      const projectName = project.name ?? 'unknown'
      const projectDir = project.dirFromWorkspacePath

      if (projectDir == null) continue

      if (project.rootMemoryPrompt != null) { // Write root memory prompt (only if exists)
        const result = await this.writePromptFile(ctx, projectDir, project.rootMemoryPrompt.content as string, `project:${projectName}/root`)
        fileResults.push(result)
      }

      if (project.childMemoryPrompts != null) { // Write children memory prompts
        for (const child of project.childMemoryPrompts) {
          const childResult = await this.writePromptFile(ctx, child.dir, child.content as string, `project:${projectName}/child:${child.workingChildDirectoryPath?.path ?? 'unknown'}`)
          fileResults.push(childResult)
        }
      }

      if (fastCommands != null) { // Write fast commands to .claude/commands/
        for (const cmd of fastCommands) {
          const cmdResults = await this.writeFastCommand(ctx, projectDir, cmd)
          fileResults.push(...cmdResults)
        }
      }

      if (subAgents != null) { // Write sub agents to .claude/agents/
        for (const agent of subAgents) {
          const agentResults = await this.writeSubAgent(ctx, projectDir, agent)
          fileResults.push(...agentResults)
        }
      }

      if (skills != null) { // Write skills to .claude/skills/
        for (const skill of skills) {
          const skillResults = await this.writeSkill(ctx, projectDir, skill)
          fileResults.push(...skillResults)
        }
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
    const fullPath = path.join(globalDir, PROJECT_MEMORY_FILE)
    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: PROJECT_MEMORY_FILE,
      basePath: globalDir,
      getDirectoryName: () => GLOBAL_CONFIG_DIR,
      getAbsolutePath: () => fullPath,
    }

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'globalMemory', path: fullPath})
      return {
        files: [{path: relativePath, success: true, skipped: false}],
        dirs: dirResults,
      }
    }

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

    return {files: fileResults, dirs: dirResults}
  }

  private async writeFastCommand(
    ctx: OutputWriteContext,
    projectDir: RelativePath,
    cmd: FastCommandPrompt,
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const transformOptions = this.getTransformOptionsFromContext(ctx) // Use transformFastCommandName with configuration from context
    const fileName = this.transformFastCommandName(cmd, transformOptions)
    const targetDir = path.join(projectDir.basePath, projectDir.path, GLOBAL_CONFIG_DIR, COMMANDS_SUBDIR)
    const fullPath = path.join(targetDir, fileName)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(projectDir.path, GLOBAL_CONFIG_DIR, COMMANDS_SUBDIR, fileName),
      basePath: projectDir.basePath,
      getDirectoryName: () => COMMANDS_SUBDIR,
      getAbsolutePath: () => fullPath,
    }

    let compiledContent = cmd.content as string // Recompile MDX with Claude Code tool preset if raw content available
    let compiledFrontMatter = cmd.yamlFrontMatter
    let useRecompiledFrontMatter = false
    if (cmd.rawMdxContent != null) {
      this.log.debug('recompiling fast command with claudeCode preset', {
        file: cmd.dir.getAbsolutePath(),
        hasRawContent: true,
        rawContentLength: cmd.rawMdxContent.length,
      })
      try {
        const scopeCollector = new GlobalScopeCollector({toolPreset: 'claudeCode'})
        const globalScope = scopeCollector.collect()
        this.log.debug('claudeCode tool scope', {tool: globalScope.tool})
        const result = await mdxToMd(cmd.rawMdxContent, {globalScope, extractMetadata: true, basePath: cmd.dir.basePath})
        compiledContent = result.content
        compiledFrontMatter = result.metadata.fields as typeof cmd.yamlFrontMatter
        useRecompiledFrontMatter = true
        this.log.debug('recompiled front matter', {frontMatter: compiledFrontMatter})
      }
      catch (e) {
        this.log.warn('failed to recompile fast command with claudeCode preset, using default', {
          file: cmd.dir.getAbsolutePath(),
          error: e instanceof Error ? e.message : String(e),
        })
      }
    } else this.log.debug('no rawMdxContent available for fast command', {file: cmd.dir.getAbsolutePath()})

    const content = useRecompiledFrontMatter // If recompiled successfully, use recompiled front matter; otherwise fall back to raw // Build content with front matter
      ? this.buildMarkdownContent(compiledContent, compiledFrontMatter)
      : this.buildMarkdownContentWithRaw(compiledContent, compiledFrontMatter, cmd.rawFrontMatter)

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'fastCommand', path: fullPath})
      return [{path: relativePath, success: true, skipped: false}]
    }

    try {
      this.ensureDirectory(targetDir)
      fs.writeFileSync(fullPath, content, 'utf8')
      this.log.trace({action: 'write', type: 'fastCommand', path: fullPath})
      results.push({path: relativePath, success: true})
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'fastCommand', path: fullPath, error: errMsg})
      results.push({path: relativePath, success: false, error: error as Error})
    }

    return results
  }

  private async writeSubAgent(
    ctx: OutputWriteContext,
    projectDir: RelativePath,
    agent: SubAgentPrompt,
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const fileName = agent.dir.path.endsWith('.md') ? agent.dir.path : `${agent.dir.path}.md`
    const targetDir = path.join(projectDir.basePath, projectDir.path, GLOBAL_CONFIG_DIR, AGENTS_SUBDIR)
    const fullPath = path.join(targetDir, fileName)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(projectDir.path, GLOBAL_CONFIG_DIR, AGENTS_SUBDIR, fileName),
      basePath: projectDir.basePath,
      getDirectoryName: () => AGENTS_SUBDIR,
      getAbsolutePath: () => fullPath,
    }

    const content = this.buildMarkdownContentWithRaw( // Build content with front matter, preferring raw if parsed failed
      agent.content as string,
      agent.yamlFrontMatter,
      agent.rawFrontMatter,
    )

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'subAgent', path: fullPath})
      return [{path: relativePath, success: true, skipped: false}]
    }

    try {
      this.ensureDirectory(targetDir)
      fs.writeFileSync(fullPath, content, 'utf8')
      this.log.trace({action: 'write', type: 'subAgent', path: fullPath})
      results.push({path: relativePath, success: true})
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'subAgent', path: fullPath, error: errMsg})
      results.push({path: relativePath, success: false, error: error as Error})
    }

    return results
  }

  private async writeSkill(
    ctx: OutputWriteContext,
    projectDir: RelativePath,
    skill: SkillPrompt,
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const skillName = skill.yamlFrontMatter?.name ?? skill.dir.getDirectoryName() // skill.dir.path is the skill directory name
    const targetDir = path.join(projectDir.basePath, projectDir.path, GLOBAL_CONFIG_DIR, SKILLS_SUBDIR, skillName)
    const fullPath = path.join(targetDir, 'SKILL.md')

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(projectDir.path, GLOBAL_CONFIG_DIR, SKILLS_SUBDIR, skillName, 'SKILL.md'),
      basePath: projectDir.basePath,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => fullPath,
    }

    const content = this.buildMarkdownContentWithRaw( // Build content with front matter, preferring raw if parsed failed
      skill.content as string,
      skill.yamlFrontMatter,
      skill.rawFrontMatter,
    )

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'skill', path: fullPath})
      return [{path: relativePath, success: true, skipped: false}]
    }

    try {
      this.ensureDirectory(targetDir)
      fs.writeFileSync(fullPath, content, 'utf8')
      this.log.trace({action: 'write', type: 'skill', path: fullPath})
      results.push({path: relativePath, success: true})

      if (skill.childDocs != null) { // Write reference documents if any
        for (const refDoc of skill.childDocs) {
          const refResults = await this.writeSkillReferenceDocument(ctx, targetDir, skillName, refDoc, projectDir)
          results.push(...refResults)
        }
      }

      if (skill.resources != null) { // Write resource files if any
        for (const resource of skill.resources) {
          const refResults = await this.writeSkillResource(ctx, targetDir, skillName, resource, projectDir)
          results.push(...refResults)
        }
      }
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'skill', path: fullPath, error: errMsg})
      results.push({path: relativePath, success: false, error: error as Error})
    }

    return results
  }

  private async writeSkillReferenceDocument(
    ctx: OutputWriteContext,
    skillDir: string,
    skillName: string,
    refDoc: {dir: RelativePath, content: unknown},
    projectDir: RelativePath,
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const fileName = refDoc.dir.path.replace(/\.mdx$/, '.md') // Convert .mdx to .md for output
    const fullPath = path.join(skillDir, fileName)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(projectDir.path, GLOBAL_CONFIG_DIR, SKILLS_SUBDIR, skillName, fileName),
      basePath: projectDir.basePath,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => fullPath,
    }

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'skillRefDoc', path: fullPath})
      return [{path: relativePath, success: true, skipped: false}]
    }

    try {
      const parentDir = path.dirname(fullPath) // Ensure parent directory exists for nested reference documents
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
    projectDir: RelativePath,
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const fullPath = path.join(skillDir, resource.relativePath)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(projectDir.path, GLOBAL_CONFIG_DIR, SKILLS_SUBDIR, skillName, resource.relativePath),
      basePath: projectDir.basePath,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => fullPath,
    }

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'skillResource', path: fullPath})
      return [{path: relativePath, success: true, skipped: false}]
    }

    try {
      const parentDir = path.dirname(fullPath) // Ensure parent directory exists for nested resources
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
