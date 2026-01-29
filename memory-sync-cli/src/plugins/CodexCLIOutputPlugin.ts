import type {
  FastCommandPrompt,
  OutputPluginContext,
  OutputWriteContext,
  SkillPrompt,
  WriteResult,
  WriteResults
} from '@/types'
import type {RelativePath} from '@/types/FileSystemTypes'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {buildMarkdownWithFrontMatter} from '@/markdown'
import {FilePathKind} from '@/types'
import {AbstractOutputPlugin} from './AbstractOutputPlugin'

const PROJECT_MEMORY_FILE = 'AGENTS.md'
const GLOBAL_CONFIG_DIR = '.codex'
const PROMPTS_SUBDIR = 'prompts'
const SKILLS_SUBDIR = 'skills'
const SKILL_FILE_NAME = 'SKILL.md'

export class CodexCLIOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('CodexCLIOutputPlugin', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
      outputFileName: PROJECT_MEMORY_FILE,
      dependsOn: ['AgentsOutputPlugin']
    })
  }

  async registerProjectOutputDirs(): Promise<RelativePath[]> {
    return [] // Codex only supports global prompts and skills, no project-level outputs
  }

  async registerProjectOutputFiles(): Promise<RelativePath[]> {
    return [] // Only register fast command files here // AGENTS.md files are handled by AgentsOutputPlugin (dependency)
  }

  async registerGlobalOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const globalDir = this.getGlobalConfigDir()
    const results: RelativePath[] = []

    const promptsPath = path.join(globalDir, PROMPTS_SUBDIR) // Register ~/.codex/prompts/ for cleanup
    results.push({
      pathKind: FilePathKind.Relative,
      path: PROMPTS_SUBDIR,
      basePath: globalDir,
      getDirectoryName: () => PROMPTS_SUBDIR,
      getAbsolutePath: () => promptsPath
    })

    const {skills} = ctx.collectedInputContext // This preserves ~/.codex/skills/.system/ which is Codex's built-in system skills // Register each skill directory individually (not the entire skills/ dir)
    if (skills != null && skills.length > 0) {
      for (const skill of skills) {
        const skillName = skill.yamlFrontMatter?.name ?? skill.dir.getDirectoryName()
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

  async registerGlobalOutputFiles(): Promise<RelativePath[]> {
    const globalDir = this.getGlobalConfigDir() // Always register ~/.codex/AGENTS.md for cleanup
    return [
      {
        pathKind: FilePathKind.Relative,
        path: PROJECT_MEMORY_FILE,
        basePath: globalDir,
        getDirectoryName: () => GLOBAL_CONFIG_DIR,
        getAbsolutePath: () => path.join(globalDir, PROJECT_MEMORY_FILE)
      }
    ]
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {globalMemory, fastCommands, skills} = ctx.collectedInputContext
    const hasGlobalMemory = globalMemory != null
    const hasFastCommands = (fastCommands?.length ?? 0) > 0
    const hasSkills = (skills?.length ?? 0) > 0

    if (hasGlobalMemory || hasFastCommands || hasSkills) return true // This plugin handles global outputs only (memory, prompts, skills) // Project AGENTS.md is handled by AgentsOutputPlugin

    this.log.trace({action: 'skip', reason: 'noOutputs'})
    return false
  }

  async writeProjectOutputs(): Promise<WriteResults> {
    return {files: [], dirs: []} // Project AGENTS.md files are handled by AgentsOutputPlugin (dependency) // Codex only supports global prompts and skills, no project-level outputs
  }

  async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {globalMemory, fastCommands, skills} = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    if (globalMemory != null) { // Write global memory file
      const globalDir = this.getGlobalConfigDir()
      const fullPath = path.join(globalDir, PROJECT_MEMORY_FILE)
      const relativePath: RelativePath = {
        pathKind: FilePathKind.Relative,
        path: PROJECT_MEMORY_FILE,
        basePath: globalDir,
        getDirectoryName: () => GLOBAL_CONFIG_DIR,
        getAbsolutePath: () => fullPath
      }

      if (ctx.dryRun === true) {
        this.log.trace({action: 'dryRun', type: 'globalMemory', path: fullPath})
        fileResults.push({path: relativePath, success: true, skipped: false})
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

    if (fastCommands != null && fastCommands.length > 0) { // Write global fast commands to ~/.codex/prompts/
      const globalDir = this.getGlobalConfigDir()
      for (const cmd of fastCommands) {
        const cmdResults = await this.writeGlobalFastCommand(ctx, globalDir, cmd)
        fileResults.push(...cmdResults)
      }
    }

    if (skills == null || skills.length === 0) return {files: fileResults, dirs: dirResults} // Write skills to ~/.codex/skills/ (Codex only supports global skills)

    const globalDir = this.getGlobalConfigDir()
    for (const skill of skills) {
      const skillResults = await this.writeGlobalSkill(ctx, globalDir, skill)
      fileResults.push(...skillResults)
    }
    return {files: fileResults, dirs: dirResults}
  }

  private async writeGlobalFastCommand(
    ctx: OutputWriteContext,
    globalDir: string,
    cmd: FastCommandPrompt
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const transformOptions = this.getTransformOptionsFromContext(ctx)
    const fileName = this.transformFastCommandName(cmd, transformOptions)
    const targetDir = path.join(globalDir, PROMPTS_SUBDIR)
    const fullPath = path.join(targetDir, fileName)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(PROMPTS_SUBDIR, fileName),
      basePath: globalDir,
      getDirectoryName: () => PROMPTS_SUBDIR,
      getAbsolutePath: () => fullPath
    }

    const content = this.buildMarkdownContentWithRaw( // Build content with front matter, preferring raw if parsed failed
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
    globalDir: string,
    skill: SkillPrompt
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const skillName = skill.yamlFrontMatter?.name ?? skill.dir.getDirectoryName()
    const targetDir = path.join(globalDir, SKILLS_SUBDIR, skillName)
    const fullPath = path.join(targetDir, SKILL_FILE_NAME)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(SKILLS_SUBDIR, skillName, SKILL_FILE_NAME),
      basePath: globalDir,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => fullPath
    }

    const content = this.buildCodexSkillContent(skill) // Build Codex-compatible front matter and content

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'globalSkill', path: fullPath})
      return [{path: relativePath, success: true, skipped: false}]
    }

    try {
      this.ensureDirectory(targetDir)
      fs.writeFileSync(fullPath, content, 'utf8')
      this.log.trace({action: 'write', type: 'globalSkill', path: fullPath})
      results.push({path: relativePath, success: true})

      if (skill.childDocs != null) { // Write reference documents if any
        for (const refDoc of skill.childDocs) {
          const refResults = await this.writeSkillReferenceDocument(ctx, targetDir, skillName, refDoc, globalDir)
          results.push(...refResults)
        }
      }

      if (skill.resources != null) { // Write resource files if any
        for (const resource of skill.resources) {
          const resourceResults = await this.writeSkillResource(ctx, targetDir, skillName, resource, globalDir)
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

    const name = this.normalizeSkillName(fm.name, 64) // Normalize name: max 64 chars, lowercase, only letters/numbers/hyphens
    const description = this.normalizeToSingleLine(fm.description, 1024) // Normalize description: max 1024 chars, single line

    const metadata: Record<string, unknown> = {} // Build metadata object with all available fields

    if (fm.displayName != null) metadata['short-description'] = fm.displayName // short-description from displayName

    if (fm.version != null) metadata['version'] = fm.version // version

    if (fm.author != null) metadata['author'] = fm.author // author

    if (fm.keywords != null && fm.keywords.length > 0) metadata['keywords'] = [...fm.keywords] // keywords

    const fmData: Record<string, unknown> = { // Build front matter data following Agent Skills spec
      name,
      description
    }

    if (Object.keys(metadata).length > 0) fmData['metadata'] = metadata // Only add metadata if it has content

    if (fm.allowTools != null && fm.allowTools.length > 0) fmData['allowed-tools'] = fm.allowTools.join(' ') // Convert allowTools to allowed-tools (space-delimited string)

    return buildMarkdownWithFrontMatter(fmData, skill.content as string)
  }

  private normalizeSkillName(name: string, maxLength: number): string {
    let normalized = name // Convert to lowercase and replace invalid characters with hyphens
      .toLowerCase()
      .replaceAll(/[^a-z0-9-]/g, '-') // Replace invalid characters with hyphens
      .replaceAll(/-+/g, '-') // Collapse multiple hyphens
      .replaceAll(/^-+|-+$/g, '') // Trim leading/trailing hyphens

    if (normalized.length > maxLength) normalized = normalized.slice(0, maxLength).replace(/-+$/, '') // Truncate if exceeds max length, remove trailing hyphens after truncation

    return normalized
  }

  private normalizeToSingleLine(text: string, maxLength: number): string {
    const singleLine = text.replaceAll(/[\r\n]+/g, ' ').replaceAll(/\s+/g, ' ').trim() // Replace newlines and multiple spaces with single space
    if (singleLine.length > maxLength) return `${singleLine.slice(0, maxLength - 3)}...` // Truncate if exceeds max length
    return singleLine
  }

  private async writeSkillReferenceDocument(
    ctx: OutputWriteContext,
    skillDir: string,
    skillName: string,
    refDoc: {dir: RelativePath, content: unknown},
    globalDir: string
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const fileName = refDoc.dir.path.replace(/\.mdx$/, '.md') // Convert .mdx to .md for output
    const fullPath = path.join(skillDir, fileName)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(SKILLS_SUBDIR, skillName, fileName),
      basePath: globalDir,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => fullPath
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
    globalDir: string
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const fullPath = path.join(skillDir, resource.relativePath)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(SKILLS_SUBDIR, skillName, resource.relativePath),
      basePath: globalDir,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => fullPath
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
