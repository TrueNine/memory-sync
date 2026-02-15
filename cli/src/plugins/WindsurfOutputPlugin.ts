import type {
  FastCommandPrompt,
  OutputPluginContext,
  OutputWriteContext,
  SkillPrompt,
  WriteResult,
  WriteResults
} from '@/types'
import type {RelativePath} from '@/types/FileSystemTypes'
import {Buffer} from 'node:buffer'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {buildMarkdownWithFrontMatter} from '@truenine/md-compiler/markdown'
import {FilePathKind} from '@/types'
import {AbstractOutputPlugin} from './AbstractOutputPlugin'

const CODEIUM_WINDSURF_DIR = '.codeium/windsurf'
const WORKFLOWS_SUBDIR = 'global_workflows'
const MEMORIES_SUBDIR = 'memories'
const GLOBAL_MEMORY_FILE = 'global_rules.md'
const SKILLS_SUBDIR = 'skills'
const SKILL_FILE_NAME = 'SKILL.md'

/**
 * Windsurf IDE output plugin.
 * Writes global configuration to ~/.codeium/windsurf/.
 * Supports global memory, skills, and fast commands (workflows).
 */
export class WindsurfOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('WindsurfOutputPlugin', {
      globalConfigDir: CODEIUM_WINDSURF_DIR,
      outputFileName: '',
      dependsOn: ['AgentsOutputPlugin']
    })
  }

  async registerGlobalOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {fastCommands, skills} = ctx.collectedInputContext

    if (fastCommands != null && fastCommands.length > 0) {
      const workflowsDir = this.getGlobalWorkflowsDir()
      results.push({
        pathKind: FilePathKind.Relative,
        path: WORKFLOWS_SUBDIR,
        basePath: this.getCodeiumWindsurfDir(),
        getDirectoryName: () => WORKFLOWS_SUBDIR,
        getAbsolutePath: () => workflowsDir
      })
    }

    if (skills != null && skills.length > 0) {
      for (const skill of skills) {
        const skillName = skill.yamlFrontMatter.name
        const skillPath = path.join(this.getCodeiumWindsurfDir(), SKILLS_SUBDIR, skillName)
        results.push({
          pathKind: FilePathKind.Relative,
          path: path.join(SKILLS_SUBDIR, skillName),
          basePath: this.getCodeiumWindsurfDir(),
          getDirectoryName: () => skillName,
          getAbsolutePath: () => skillPath
        })
      }
    }

    return results
  }

  async registerGlobalOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {skills, fastCommands} = ctx.collectedInputContext

    if (fastCommands != null && fastCommands.length > 0) {
      const workflowsDir = this.getGlobalWorkflowsDir()
      const transformOptions = this.getTransformOptionsFromContext(ctx, {includeSeriesPrefix: true})
      for (const cmd of fastCommands) {
        const fileName = this.transformFastCommandName(cmd, transformOptions)
        const fullPath = path.join(workflowsDir, fileName)
        results.push({
          pathKind: FilePathKind.Relative,
          path: path.join(WORKFLOWS_SUBDIR, fileName),
          basePath: this.getCodeiumWindsurfDir(),
          getDirectoryName: () => WORKFLOWS_SUBDIR,
          getAbsolutePath: () => fullPath
        })
      }
    }

    if (skills == null || skills.length === 0) return results

    const skillsDir = this.getSkillsDir()
    const codeiumDir = this.getCodeiumWindsurfDir()
    for (const skill of skills) {
      const skillName = skill.yamlFrontMatter.name
      const skillDir = path.join(skillsDir, skillName)
      results.push({
        pathKind: FilePathKind.Relative,
        path: path.join(SKILLS_SUBDIR, skillName, SKILL_FILE_NAME),
        basePath: codeiumDir,
        getDirectoryName: () => skillName,
        getAbsolutePath: () => path.join(skillDir, SKILL_FILE_NAME)
      })

      if (skill.childDocs != null) {
        for (const childDoc of skill.childDocs) {
          const outputRelativePath = childDoc.relativePath.replace(/\.mdx$/, '.md')
          results.push({
            pathKind: FilePathKind.Relative,
            path: path.join(SKILLS_SUBDIR, skillName, outputRelativePath),
            basePath: codeiumDir,
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
            basePath: codeiumDir,
            getDirectoryName: () => skillName,
            getAbsolutePath: () => path.join(skillDir, resource.relativePath)
          })
        }
      }
    }
    return results
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {skills, fastCommands, globalMemory} = ctx.collectedInputContext
    const hasSkills = (skills?.length ?? 0) > 0
    const hasFastCommands = (fastCommands?.length ?? 0) > 0
    const hasGlobalMemory = globalMemory != null

    if (hasSkills || hasFastCommands || hasGlobalMemory) return true

    this.log.trace({action: 'skip', reason: 'noOutputs'})
    return false
  }

  async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {skills, fastCommands, globalMemory} = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    if (globalMemory != null) {
      const result = await this.writeGlobalMemory(ctx, globalMemory.content as string)
      fileResults.push(result)
    }

    if (skills != null && skills.length > 0) {
      const skillsDir = this.getSkillsDir()
      for (const skill of skills) {
        const skillResults = await this.writeGlobalSkill(ctx, skillsDir, skill)
        fileResults.push(...skillResults)
      }
    }

    if (fastCommands == null || fastCommands.length === 0) return {files: fileResults, dirs: dirResults}

    const workflowsDir = this.getGlobalWorkflowsDir()
    for (const cmd of fastCommands) {
      const result = await this.writeGlobalWorkflow(ctx, workflowsDir, cmd)
      fileResults.push(result)
    }
    return {files: fileResults, dirs: dirResults}
  }

  async writeProjectOutputs(): Promise<WriteResults> {
    return {files: [], dirs: []}
  }

  private getSkillsDir(): string {
    return path.join(this.getCodeiumWindsurfDir(), SKILLS_SUBDIR)
  }

  private getCodeiumWindsurfDir(): string {
    return path.join(this.getHomeDir(), CODEIUM_WINDSURF_DIR)
  }

  private getGlobalMemoriesDir(): string {
    return path.join(this.getCodeiumWindsurfDir(), MEMORIES_SUBDIR)
  }

  private getGlobalWorkflowsDir(): string {
    return path.join(this.getCodeiumWindsurfDir(), WORKFLOWS_SUBDIR)
  }

  private async writeGlobalMemory(
    ctx: OutputWriteContext,
    content: string
  ): Promise<WriteResult> {
    const memoriesDir = this.getGlobalMemoriesDir()
    const fullPath = path.join(memoriesDir, GLOBAL_MEMORY_FILE)
    const codeiumDir = this.getCodeiumWindsurfDir()

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(MEMORIES_SUBDIR, GLOBAL_MEMORY_FILE),
      basePath: codeiumDir,
      getDirectoryName: () => MEMORIES_SUBDIR,
      getAbsolutePath: () => fullPath
    }

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'globalMemory', path: fullPath})
      return {path: relativePath, success: true, skipped: false}
    }

    try {
      this.ensureDirectory(memoriesDir)
      this.writeFileSync(fullPath, content)
      this.log.trace({action: 'write', type: 'globalMemory', path: fullPath})
      return {path: relativePath, success: true}
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'globalMemory', path: fullPath, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
  }

  private async writeGlobalWorkflow(
    ctx: OutputWriteContext,
    workflowsDir: string,
    cmd: FastCommandPrompt
  ): Promise<WriteResult> {
    const transformOptions = this.getTransformOptionsFromContext(ctx, {includeSeriesPrefix: true})
    const fileName = this.transformFastCommandName(cmd, transformOptions)
    const fullPath = path.join(workflowsDir, fileName)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(WORKFLOWS_SUBDIR, fileName),
      basePath: this.getCodeiumWindsurfDir(),
      getDirectoryName: () => WORKFLOWS_SUBDIR,
      getAbsolutePath: () => fullPath
    }

    const content = this.buildMarkdownContentWithRaw(
      cmd.content,
      cmd.yamlFrontMatter,
      cmd.rawFrontMatter
    )

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'globalWorkflow', path: fullPath})
      return {path: relativePath, success: true, skipped: false}
    }

    try {
      this.ensureDirectory(workflowsDir)
      fs.writeFileSync(fullPath, content)
      this.log.trace({action: 'write', type: 'globalWorkflow', path: fullPath})
      return {path: relativePath, success: true}
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'globalWorkflow', path: fullPath, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
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
    const codeiumDir = this.getCodeiumWindsurfDir()

    const skillRelativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(SKILLS_SUBDIR, skillName, SKILL_FILE_NAME),
      basePath: codeiumDir,
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

    if (skill.childDocs != null) {
      for (const childDoc of skill.childDocs) {
        const childResult = await this.writeSkillChildDoc(ctx, childDoc, skillDir, skillName, codeiumDir)
        results.push(childResult)
      }
    }

    if (skill.resources != null) {
      for (const resource of skill.resources) {
        const resourceResult = await this.writeSkillResource(ctx, resource, skillDir, skillName, codeiumDir)
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

  private async writeSkillChildDoc(
    ctx: OutputWriteContext,
    childDoc: {relativePath: string, content: unknown},
    skillDir: string,
    skillName: string,
    baseDir: string
  ): Promise<WriteResult> {
    const outputRelativePath = childDoc.relativePath.replace(/\.mdx$/, '.md')
    const childDocPath = path.join(skillDir, outputRelativePath)
    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(SKILLS_SUBDIR, skillName, outputRelativePath),
      basePath: baseDir,
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
    baseDir: string
  ): Promise<WriteResult> {
    const resourcePath = path.join(skillDir, resource.relativePath)
    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(SKILLS_SUBDIR, skillName, resource.relativePath),
      basePath: baseDir,
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
