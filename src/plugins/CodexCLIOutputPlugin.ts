// @see https://www.bilibili.com/video/BV1MAY5zWEPS codex 自定义斜杠命令
// @see https://developers.openai.com/codex/skills/create-skill codex 如何创建 skills
//
// Codex CLI configuration:
// - Global config dir: ~/.codex/
// - Global prompts dir: ~/.codex/prompts/
// - Global memory file: ~/.codex/AGENTS.md
// - Global skills dir: ~/.codex/skills/ (Codex only supports global skills, no project-level skills)

import type {
  FastCommandPrompt,
  OutputPluginContext,
  OutputWriteContext,
  SkillPrompt,
  WriteResult,
  WriteResults,
} from '@/types'
import type { RelativePath } from '@/types/FileSystemTypes'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { buildMarkdownWithFrontMatter } from '@/markdown'
import { FilePathKind } from '@/types'
import { AbstractOutputPlugin } from './AbstractOutputPlugin'

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
      dependsOn: ['AgentsOutputPlugin'],
    })
  }

  async registerProjectOutputDirs(): Promise<RelativePath[]> {
    // Codex only supports global prompts and skills, no project-level outputs
    return []
  }

  async registerProjectOutputFiles(): Promise<RelativePath[]> {
    // AGENTS.md files are handled by AgentsOutputPlugin (dependency)
    // Only register fast command files here
    return []
  }

  async registerGlobalOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const globalDir = this.getGlobalConfigDir()
    const results: RelativePath[] = []

    // Register ~/.codex/prompts/ for cleanup
    const promptsPath = path.join(globalDir, PROMPTS_SUBDIR)
    results.push({
      pathKind: FilePathKind.Relative,
      path: PROMPTS_SUBDIR,
      basePath: globalDir,
      getDirectoryName: () => PROMPTS_SUBDIR,
      getAbsolutePath: () => promptsPath,
    })

    // Register each skill directory individually (not the entire skills/ dir)
    // This preserves ~/.codex/skills/.system/ which is Codex's built-in system skills
    const { skills } = ctx.collectedInputContext
    if (skills != null && skills.length > 0) {
      for (const skill of skills) {
        const skillName = skill.yamlFrontMatter?.name ?? skill.dir.getDirectoryName()
        const skillPath = path.join(globalDir, SKILLS_SUBDIR, skillName)
        results.push({
          pathKind: FilePathKind.Relative,
          path: path.join(SKILLS_SUBDIR, skillName),
          basePath: globalDir,
          getDirectoryName: () => skillName,
          getAbsolutePath: () => skillPath,
        })
      }
    }

    return results
  }

  async registerGlobalOutputFiles(): Promise<RelativePath[]> {
    // Always register ~/.codex/AGENTS.md for cleanup
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
    const { globalMemory, fastCommands, skills } = ctx.collectedInputContext
    const hasGlobalMemory = globalMemory != null
    const hasFastCommands = (fastCommands?.length ?? 0) > 0
    const hasSkills = (skills?.length ?? 0) > 0

    // Project AGENTS.md is handled by AgentsOutputPlugin
    // This plugin handles global outputs only (memory, prompts, skills)
    if (hasGlobalMemory || hasFastCommands || hasSkills) return true

    this.log.trace({ action: 'skip', reason: 'noOutputs' })
    return false
  }

  async writeProjectOutputs(): Promise<WriteResults> {
    // Codex only supports global prompts and skills, no project-level outputs
    // Project AGENTS.md files are handled by AgentsOutputPlugin (dependency)
    return { files: [], dirs: [] }
  }

  async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const { globalMemory, fastCommands, skills } = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    // Write global memory file
    if (globalMemory != null) {
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
        this.log.trace({ action: 'dryRun', type: 'globalMemory', path: fullPath })
        fileResults.push({ path: relativePath, success: true, skipped: false })
      } else {
        try {
          this.ensureDirectory(globalDir)
          fs.writeFileSync(fullPath, globalMemory.content as string, 'utf8')
          this.log.trace({ action: 'write', type: 'globalMemory', path: fullPath })
          fileResults.push({ path: relativePath, success: true })
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error)
          this.log.error({ action: 'write', type: 'globalMemory', path: fullPath, error: errMsg })
          fileResults.push({ path: relativePath, success: false, error: error as Error })
        }
      }
    }

    // Write global fast commands to ~/.codex/prompts/
    if (fastCommands != null && fastCommands.length > 0) {
      const globalDir = this.getGlobalConfigDir()
      for (const cmd of fastCommands) {
        const cmdResults = await this.writeGlobalFastCommand(ctx, globalDir, cmd)
        fileResults.push(...cmdResults)
      }
    }

    // Write skills to ~/.codex/skills/ (Codex only supports global skills)
    if (skills == null && skills.length > 0) return { files: fileResults, dirs: dirResults }

    const globalDir = this.getGlobalConfigDir()
    for (const skill of skills) {
      const skillResults = await this.writeGlobalSkill(ctx, globalDir, skill)
      fileResults.push(...skillResults)
    }
    return { files: fileResults, dirs: dirResults }
  }

  private async writeGlobalFastCommand(
    ctx: OutputWriteContext,
    globalDir: string,
    cmd: FastCommandPrompt,
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
      getAbsolutePath: () => fullPath,
    }

    // Build content with front matter, preferring raw if parsed failed
    const content = this.buildMarkdownContentWithRaw(
      cmd.content as string,
      cmd.yamlFrontMatter,
      cmd.rawFrontMatter,
    )

    if (ctx.dryRun === true) {
      this.log.trace({ action: 'dryRun', type: 'globalFastCommand', path: fullPath })
      return [{ path: relativePath, success: true, skipped: false }]
    }

    try {
      this.ensureDirectory(targetDir)
      fs.writeFileSync(fullPath, content, 'utf8')
      this.log.trace({ action: 'write', type: 'globalFastCommand', path: fullPath })
      results.push({ path: relativePath, success: true })
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({ action: 'write', type: 'globalFastCommand', path: fullPath, error: errMsg })
      results.push({ path: relativePath, success: false, error: error as Error })
    }

    return results
  }

  /**
   * Write a skill to ~/.codex/skills/<skill-name>/SKILL.md
   * Codex only supports global skills, no project-level skills
   */
  private async writeGlobalSkill(
    ctx: OutputWriteContext,
    globalDir: string,
    skill: SkillPrompt,
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
      getAbsolutePath: () => fullPath,
    }

    // Build Codex-compatible front matter and content
    const content = this.buildCodexSkillContent(skill)

    if (ctx.dryRun === true) {
      this.log.trace({ action: 'dryRun', type: 'globalSkill', path: fullPath })
      return [{ path: relativePath, success: true, skipped: false }]
    }

    try {
      this.ensureDirectory(targetDir)
      fs.writeFileSync(fullPath, content, 'utf8')
      this.log.trace({ action: 'write', type: 'globalSkill', path: fullPath })
      results.push({ path: relativePath, success: true })

      // Write reference documents if any
      if (skill.childDocs != null) {
        for (const refDoc of skill.childDocs) {
          const refResults = await this.writeSkillReferenceDocument(ctx, targetDir, skillName, refDoc, globalDir)
          results.push(...refResults)
        }
      }

      // Write resource files if any
      if (skill.resources != null) {
        for (const resource of skill.resources) {
          const resourceResults = await this.writeSkillResource(ctx, targetDir, skillName, resource, globalDir)
          results.push(...resourceResults)
        }
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({ action: 'write', type: 'globalSkill', path: fullPath, error: errMsg })
      results.push({ path: relativePath, success: false, error: error as Error })
    }

    return results
  }

  /**
   * Build Codex-compatible SKILL.md content with front matter
   * Converts SkillYAMLFrontMatter to CodexSkillYAMLFrontMatter format
   *
   * Follows Agent Skills specification: https://agentskills.io/specification
   *
   * Required fields:
   * - name: Max 64 characters. Lowercase letters, numbers, and hyphens only.
   * - description: Max 1024 characters. Describes what the skill does and when to use it.
   *
   * Optional fields:
   * - license: License name or reference to a bundled license file.
   * - compatibility: Max 500 characters. Environment requirements.
   * - metadata: Arbitrary key-value mapping (displayName, version, author, keywords, etc.)
   * - allowed-tools: Space-delimited list of pre-approved tools (experimental).
   */
  private buildCodexSkillContent(skill: SkillPrompt): string {
    const fm = skill.yamlFrontMatter

    // Normalize name: max 64 chars, lowercase, only letters/numbers/hyphens
    const name = this.normalizeSkillName(fm.name, 64)
    // Normalize description: max 1024 chars, single line
    const description = this.normalizeToSingleLine(fm.description, 1024)

    // Build metadata object with all available fields
    const metadata: Record<string, unknown> = {}

    // short-description from displayName
    if (fm.displayName != null) metadata['short-description'] = fm.displayName

    // version
    if (fm.version != null) metadata['version'] = fm.version

    // author
    if (fm.author != null) metadata['author'] = fm.author

    // keywords
    if (fm.keywords != null && fm.keywords.length > 0) metadata['keywords'] = [...fm.keywords]

    // Build front matter data following Agent Skills spec
    const fmData: Record<string, unknown> = {
      name,
      description,
    }

    // Only add metadata if it has content
    if (Object.keys(metadata).length > 0) fmData['metadata'] = metadata

    // Convert allowTools to allowed-tools (space-delimited string)
    if (fm.allowTools != null && fm.allowTools.length > 0) fmData['allowed-tools'] = fm.allowTools.join(' ')

    return buildMarkdownWithFrontMatter(fmData, skill.content as string)
  }

  /**
   * Normalize skill name to Agent Skills spec requirements:
   * - Max 64 characters
   * - Lowercase letters, numbers, and hyphens only
   * - Must not start or end with a hyphen
   */
  private normalizeSkillName(name: string, maxLength: number): string {
    // Convert to lowercase and replace invalid characters with hyphens
    let normalized = name
      .toLowerCase()
      // Replace invalid characters with hyphens
      .replaceAll(/[^a-z0-9-]/g, '-')
      // Collapse multiple hyphens
      .replaceAll(/-+/g, '-')
      // Trim leading/trailing hyphens
      .replaceAll(/^-+|-+$/g, '')

    // Truncate if exceeds max length, remove trailing hyphens after truncation
    if (normalized.length > maxLength) normalized = normalized.slice(0, maxLength).replace(/-+$/, '')

    return normalized
  }

  /**
   * Normalize text to single line by replacing newlines with spaces
   * and truncating to max length
   */
  private normalizeToSingleLine(text: string, maxLength: number): string {
    // Replace newlines and multiple spaces with single space
    const singleLine = text.replaceAll(/[\r\n]+/g, ' ').replaceAll(/\s+/g, ' ').trim()
    // Truncate if exceeds max length
    if (singleLine.length > maxLength) return `${singleLine.slice(0, maxLength - 3)}...`
    return singleLine
  }

  /**
   * Write skill reference document
   */
  private async writeSkillReferenceDocument(
    ctx: OutputWriteContext,
    skillDir: string,
    skillName: string,
    refDoc: { dir: RelativePath, content: unknown },
    globalDir: string,
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    // Convert .mdx to .md for output
    const fileName = refDoc.dir.path.replace(/\.mdx$/, '.md')
    const fullPath = path.join(skillDir, fileName)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(SKILLS_SUBDIR, skillName, fileName),
      basePath: globalDir,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => fullPath,
    }

    if (ctx.dryRun === true) {
      this.log.trace({ action: 'dryRun', type: 'skillRefDoc', path: fullPath })
      return [{ path: relativePath, success: true, skipped: false }]
    }

    try {
      // Ensure parent directory exists for nested reference documents
      const parentDir = path.dirname(fullPath)
      this.ensureDirectory(parentDir)
      fs.writeFileSync(fullPath, refDoc.content as string, 'utf8')
      this.log.trace({ action: 'write', type: 'skillRefDoc', path: fullPath })
      results.push({ path: relativePath, success: true })
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({ action: 'write', type: 'skillRefDoc', path: fullPath, error: errMsg })
      results.push({ path: relativePath, success: false, error: error as Error })
    }

    return results
  }

  /**
   * Write skill resource file (non-.md files like .kt, .java, .sql, etc.)
   */
  private async writeSkillResource(
    ctx: OutputWriteContext,
    skillDir: string,
    skillName: string,
    resource: { relativePath: string, content: string },
    globalDir: string,
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const fullPath = path.join(skillDir, resource.relativePath)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(SKILLS_SUBDIR, skillName, resource.relativePath),
      basePath: globalDir,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => fullPath,
    }

    if (ctx.dryRun === true) {
      this.log.trace({ action: 'dryRun', type: 'skillResource', path: fullPath })
      return [{ path: relativePath, success: true, skipped: false }]
    }

    try {
      // Ensure parent directory exists for nested resources
      const parentDir = path.dirname(fullPath)
      this.ensureDirectory(parentDir)
      fs.writeFileSync(fullPath, resource.content, 'utf8')
      this.log.trace({ action: 'write', type: 'skillResource', path: fullPath })
      results.push({ path: relativePath, success: true })
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({ action: 'write', type: 'skillResource', path: fullPath, error: errMsg })
      results.push({ path: relativePath, success: false, error: error as Error })
    }

    return results
  }
}
