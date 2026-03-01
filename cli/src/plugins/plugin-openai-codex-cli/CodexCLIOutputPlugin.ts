import type {
  FastCommandPrompt,
  OutputPluginContext,
  OutputWriteContext,
  SkillPrompt,
  WriteResult,
  WriteResults
} from '@truenine/plugin-shared'
import type {RelativePath} from '@truenine/plugin-shared/types'
import * as path from 'node:path'
import {buildMarkdownWithFrontMatter} from '@truenine/md-compiler/markdown'
import {AbstractOutputPlugin, filterCommandsByProjectConfig, filterSkillsByProjectConfig} from '@truenine/plugin-output-shared'
import {PLUGIN_NAMES} from '@truenine/plugin-shared'

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
      dependsOn: [PLUGIN_NAMES.AgentsOutput]
    })
  }

  async registerProjectOutputDirs(): Promise<RelativePath[]> {
    return [] // Codex only supports global prompts and skills
  }

  async registerProjectOutputFiles(): Promise<RelativePath[]> {
    return [] // AGENTS.md files are handled by AgentsOutputPlugin
  }

  async registerGlobalOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const globalDir = this.getGlobalConfigDir()
    const results: RelativePath[] = [
      this.createRelativePath(PROMPTS_SUBDIR, globalDir, () => PROMPTS_SUBDIR)
    ]

    const {skills} = ctx.collectedInputContext
    if (skills == null || skills.length === 0) return results

    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const filteredSkills = filterSkillsByProjectConfig(skills, projectConfig)
    for (const skill of filteredSkills) {
      const skillName = skill.yamlFrontMatter?.name ?? skill.dir.getDirectoryName()
      results.push(this.createRelativePath(
        path.join(SKILLS_SUBDIR, skillName),
        globalDir,
        () => skillName
      ))
    }
    return results
  }

  async registerGlobalOutputFiles(): Promise<RelativePath[]> {
    const globalDir = this.getGlobalConfigDir()
    return [
      this.createRelativePath(PROJECT_MEMORY_FILE, globalDir, () => GLOBAL_CONFIG_DIR)
    ]
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {globalMemory, fastCommands, skills} = ctx.collectedInputContext
    if (globalMemory != null || (fastCommands?.length ?? 0) > 0 || (skills?.length ?? 0) > 0) return true
    this.log.trace({action: 'skip', reason: 'noOutputs'})
    return false
  }

  async writeProjectOutputs(): Promise<WriteResults> {
    return {files: [], dirs: []} // Handled by AgentsOutputPlugin
  }

  async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {globalMemory, fastCommands, skills} = ctx.collectedInputContext
    const projectConfig = this.resolvePromptSourceProjectConfig(ctx)
    const fileResults: WriteResult[] = []
    const globalDir = this.getGlobalConfigDir()

    if (globalMemory != null) {
      const fullPath = path.join(globalDir, PROJECT_MEMORY_FILE)
      const result = await this.writeFile(ctx, fullPath, globalMemory.content as string, 'globalMemory')
      fileResults.push(result)
    }

    if (fastCommands != null && fastCommands.length > 0) {
      const filteredCommands = filterCommandsByProjectConfig(fastCommands, projectConfig)
      for (const cmd of filteredCommands) {
        const result = await this.writeGlobalFastCommand(ctx, globalDir, cmd)
        fileResults.push(result)
      }
    }

    if (skills == null || skills.length === 0) return {files: fileResults, dirs: []}

    const filteredSkills = filterSkillsByProjectConfig(skills, projectConfig)
    for (const skill of filteredSkills) {
      const skillResults = await this.writeGlobalSkill(ctx, globalDir, skill)
      fileResults.push(...skillResults)
    }
    return {files: fileResults, dirs: []}
  }

  private async writeGlobalFastCommand(
    ctx: OutputWriteContext,
    globalDir: string,
    cmd: FastCommandPrompt
  ): Promise<WriteResult> {
    const transformOptions = this.getTransformOptionsFromContext(ctx)
    const fileName = this.transformFastCommandName(cmd, transformOptions)
    const fullPath = path.join(globalDir, PROMPTS_SUBDIR, fileName)
    const content = this.buildMarkdownContentWithRaw(cmd.content, cmd.yamlFrontMatter, cmd.rawFrontMatter)
    return this.writeFile(ctx, fullPath, content, 'globalFastCommand')
  }

  private async writeGlobalSkill(
    ctx: OutputWriteContext,
    globalDir: string,
    skill: SkillPrompt
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const skillName = skill.yamlFrontMatter?.name ?? skill.dir.getDirectoryName()
    const skillDir = path.join(globalDir, SKILLS_SUBDIR, skillName)
    const skillFilePath = path.join(skillDir, SKILL_FILE_NAME)

    const content = this.buildCodexSkillContent(skill)
    const mainResult = await this.writeFile(ctx, skillFilePath, content, 'globalSkill')
    results.push(mainResult)

    if (skill.childDocs != null) {
      for (const refDoc of skill.childDocs) {
        const fileName = refDoc.dir.path.replace(/\.mdx$/, '.md')
        const fullPath = path.join(skillDir, fileName)
        const refResult = await this.writeFile(ctx, fullPath, refDoc.content as string, 'skillRefDoc')
        results.push(refResult)
      }
    }

    if (skill.resources != null) {
      for (const resource of skill.resources) {
        const fullPath = path.join(skillDir, resource.relativePath)
        const resourceResult = await this.writeFile(ctx, fullPath, resource.content, 'skillResource')
        results.push(resourceResult)
      }
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

    const fmData: Record<string, unknown> = {name, description}
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
}
