import type {
  OutputPluginContext,
  OutputWriteContext,
  SkillPrompt,
  WriteResult,
  WriteResults
} from '@/types'
import type {RelativePath} from '@/types/FileSystemTypes'

import {Buffer} from 'node:buffer'
import * as fs from 'node:fs'
import {buildMarkdownWithFrontMatter} from '@truenine/md-compiler/markdown'
import {FilePathKind} from '@/types'
import {AbstractOutputPlugin} from './AbstractOutputPlugin'

const PROJECT_SKILLS_DIR = '.skills'
const GLOBAL_SKILLS_DIR = '.aindex/.skills'
const OLD_GLOBAL_SKILLS_DIR = '.skills' // 向后兼容：旧的全局 skills 目录
const SKILL_FILE_NAME = 'SKILL.md'
const MCP_CONFIG_FILE = 'mcp.json'

/**
 * Output plugin that writes skills to a global location (~/.skills/) and
 * creates symlinks in each project pointing to the global skill directories.
 *
 * This approach reduces disk space usage when multiple projects use the same skills.
 *
 * Structure:
 * - Global: ~/.skills/<skill-name>/SKILL.md, mcp.json, child docs, resources
 * - Project: <project>/.skills/<skill-name> → ~/.skills/<skill-name> (symlink)
 */
export class GenericSkillsOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('GenericSkillsOutputPlugin', {globalConfigDir: GLOBAL_SKILLS_DIR, outputFileName: SKILL_FILE_NAME})

    this.registerCleanEffect('legacy-global-skills-cleanup', async ctx => { // 向后兼容：clean 时清理旧的 ~/.skills 目录
      const oldGlobalSkillsDir = this.joinPath(this.getHomeDir(), OLD_GLOBAL_SKILLS_DIR)
      if (!this.existsSync(oldGlobalSkillsDir)) return {success: true, description: 'Legacy global skills dir does not exist, nothing to clean'}
      if (ctx.dryRun === true) {
        this.log.trace({action: 'dryRun', type: 'legacyCleanup', path: oldGlobalSkillsDir})
        return {success: true, description: `Would clean legacy global skills dir: ${oldGlobalSkillsDir}`}
      }
      try {
        const entries = this.readdirSync(oldGlobalSkillsDir, {withFileTypes: true}) // 只删除 skill 子目录（避免误删用户其他文件）
        let cleanedCount = 0
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const skillDir = this.joinPath(oldGlobalSkillsDir, entry.name)
            const skillFile = this.joinPath(skillDir, SKILL_FILE_NAME)
            if (this.existsSync(skillFile)) { // 确认是 skill 目录（包含 SKILL.md）才删除
              fs.rmSync(skillDir, {recursive: true})
              cleanedCount++
            }
          }
        }
        const remainingEntries = this.readdirSync(oldGlobalSkillsDir) // 如果目录为空则删除目录本身
        if (remainingEntries.length === 0) fs.rmdirSync(oldGlobalSkillsDir)
        this.log.trace({action: 'clean', type: 'legacySkills', dir: oldGlobalSkillsDir, cleanedCount})
        return {success: true, description: `Cleaned ${cleanedCount} legacy skills from ${oldGlobalSkillsDir}`}
      }
      catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        this.log.error({action: 'clean', type: 'legacySkills', dir: oldGlobalSkillsDir, error: errMsg})
        return {success: false, description: `Failed to clean legacy skills dir`, error: error as Error}
      }
    })
  }

  private getGlobalSkillsDir(): string {
    return this.joinPath(this.getHomeDir(), GLOBAL_SKILLS_DIR)
  }

  async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {projects} = ctx.collectedInputContext.workspace
    const {skills} = ctx.collectedInputContext

    if (skills == null || skills.length === 0) return results

    for (const project of projects) { // Register <project>/.skills/ for cleanup (symlink directory)
      if (project.dirFromWorkspacePath == null) continue

      const skillsDir = this.joinPath(project.dirFromWorkspacePath.path, PROJECT_SKILLS_DIR)
      results.push({
        pathKind: FilePathKind.Relative,
        path: skillsDir,
        basePath: project.dirFromWorkspacePath.basePath,
        getDirectoryName: () => PROJECT_SKILLS_DIR,
        getAbsolutePath: () => this.joinPath(project.dirFromWorkspacePath!.basePath, skillsDir)
      })
    }

    return results
  }

  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {projects} = ctx.collectedInputContext.workspace
    const {skills} = ctx.collectedInputContext

    if (skills == null || skills.length === 0) return results

    for (const project of projects) { // Register symlink paths (skills in project are now symlinks)
      if (project.dirFromWorkspacePath == null) continue

      const projectSkillsDir = this.joinPath(project.dirFromWorkspacePath.basePath, project.dirFromWorkspacePath.path, PROJECT_SKILLS_DIR)

      for (const skill of skills) {
        const skillName = skill.yamlFrontMatter.name
        const skillDir = this.joinPath(projectSkillsDir, skillName)

        results.push({ // Register skill directory symlink
          pathKind: FilePathKind.Relative,
          path: this.joinPath(PROJECT_SKILLS_DIR, skillName),
          basePath: this.joinPath(project.dirFromWorkspacePath.basePath, project.dirFromWorkspacePath.path),
          getDirectoryName: () => skillName,
          getAbsolutePath: () => skillDir
        })
      }
    }

    return results
  }

  async registerGlobalOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const {skills} = ctx.collectedInputContext

    if (skills == null || skills.length === 0) return []

    const globalSkillsDir = this.getGlobalSkillsDir()
    return [{
      pathKind: FilePathKind.Relative,
      path: GLOBAL_SKILLS_DIR,
      basePath: this.getHomeDir(),
      getDirectoryName: () => GLOBAL_SKILLS_DIR,
      getAbsolutePath: () => globalSkillsDir
    }]
  }

  async registerGlobalOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {skills} = ctx.collectedInputContext

    if (skills == null || skills.length === 0) return results

    const globalSkillsDir = this.getGlobalSkillsDir()

    for (const skill of skills) {
      const skillName = skill.yamlFrontMatter.name
      const skillDir = this.joinPath(globalSkillsDir, skillName)

      results.push({ // Register SKILL.md
        pathKind: FilePathKind.Relative,
        path: this.joinPath(GLOBAL_SKILLS_DIR, skillName, SKILL_FILE_NAME),
        basePath: this.getHomeDir(),
        getDirectoryName: () => skillName,
        getAbsolutePath: () => this.joinPath(skillDir, SKILL_FILE_NAME)
      })

      if (skill.mcpConfig != null) { // Register mcp.json if skill has MCP configuration
        results.push({
          pathKind: FilePathKind.Relative,
          path: this.joinPath(GLOBAL_SKILLS_DIR, skillName, MCP_CONFIG_FILE),
          basePath: this.getHomeDir(),
          getDirectoryName: () => skillName,
          getAbsolutePath: () => this.joinPath(skillDir, MCP_CONFIG_FILE)
        })
      }

      if (skill.childDocs != null) { // Register child docs (convert .mdx to .md)
        for (const childDoc of skill.childDocs) {
          const outputRelativePath = childDoc.relativePath.replace(/\.mdx$/, '.md')
          results.push({
            pathKind: FilePathKind.Relative,
            path: this.joinPath(GLOBAL_SKILLS_DIR, skillName, outputRelativePath),
            basePath: this.getHomeDir(),
            getDirectoryName: () => skillName,
            getAbsolutePath: () => this.joinPath(skillDir, outputRelativePath)
          })
        }
      }

      if (skill.resources != null) { // Register resources
        for (const resource of skill.resources) {
          results.push({
            pathKind: FilePathKind.Relative,
            path: this.joinPath(GLOBAL_SKILLS_DIR, skillName, resource.relativePath),
            basePath: this.getHomeDir(),
            getDirectoryName: () => skillName,
            getAbsolutePath: () => this.joinPath(skillDir, resource.relativePath)
          })
        }
      }
    }

    return results
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {skills} = ctx.collectedInputContext
    const {projects} = ctx.collectedInputContext.workspace

    if (skills == null || skills.length === 0) {
      this.log.trace({action: 'skip', reason: 'noSkills'})
      return false
    }

    if (projects.length !== 0) return true

    this.log.trace({action: 'skip', reason: 'noProjects'})
    return false
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {projects} = ctx.collectedInputContext.workspace
    const {skills} = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    if (skills == null || skills.length === 0) return {files: fileResults, dirs: dirResults}

    const globalSkillsDir = this.getGlobalSkillsDir()

    for (const project of projects) { // Create symlinks for each project
      if (project.dirFromWorkspacePath == null) continue

      const projectSkillsDir = this.joinPath(project.dirFromWorkspacePath.basePath, project.dirFromWorkspacePath.path, PROJECT_SKILLS_DIR)

      for (const skill of skills) {
        const skillName = skill.yamlFrontMatter.name
        const globalSkillDir = this.joinPath(globalSkillsDir, skillName)
        const projectSkillDir = this.joinPath(projectSkillsDir, skillName)

        const relativePath: RelativePath = {
          pathKind: FilePathKind.Relative,
          path: this.joinPath(PROJECT_SKILLS_DIR, skillName),
          basePath: this.joinPath(project.dirFromWorkspacePath.basePath, project.dirFromWorkspacePath.path),
          getDirectoryName: () => skillName,
          getAbsolutePath: () => projectSkillDir
        }

        if (ctx.dryRun === true) {
          this.log.trace({action: 'dryRun', type: 'symlink', target: globalSkillDir, link: projectSkillDir})
          fileResults.push({path: relativePath, success: true, skipped: false})
          continue
        }

        try {
          this.createSymlink(globalSkillDir, projectSkillDir, 'dir')
          this.log.trace({action: 'symlink', type: 'skill', target: globalSkillDir, link: projectSkillDir})
          fileResults.push({path: relativePath, success: true})
        }
        catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error)
          this.log.error({action: 'symlink', type: 'skill', target: globalSkillDir, link: projectSkillDir, error: errMsg})
          fileResults.push({path: relativePath, success: false, error: error as Error})
        }
      }
    }

    return {files: fileResults, dirs: dirResults}
  }

  async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {skills} = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    if (skills == null || skills.length === 0) return {files: fileResults, dirs: dirResults}

    const globalSkillsDir = this.getGlobalSkillsDir()

    for (const skill of skills) { // Write all skills to global ~/.skills/ directory
      const skillResults = await this.writeSkill(ctx, skill, globalSkillsDir)
      fileResults.push(...skillResults)
    }

    return {files: fileResults, dirs: dirResults}
  }

  private async writeSkill(
    ctx: OutputWriteContext,
    skill: SkillPrompt,
    skillsDir: string
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const skillName = skill.yamlFrontMatter.name
    const skillDir = this.joinPath(skillsDir, skillName)
    const skillFilePath = this.joinPath(skillDir, SKILL_FILE_NAME)

    const skillRelativePath: RelativePath = { // Create RelativePath for SKILL.md
      pathKind: FilePathKind.Relative,
      path: SKILL_FILE_NAME,
      basePath: skillDir,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => skillFilePath
    }

    const frontMatterData = this.buildSkillFrontMatter(skill) // Build SKILL.md content with front matter
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

    if (skill.mcpConfig != null) { // Write mcp.json if skill has MCP configuration
      const mcpResult = await this.writeMcpConfig(ctx, skill, skillDir)
      results.push(mcpResult)
    }

    if (skill.childDocs != null) { // Write child docs
      for (const childDoc of skill.childDocs) {
        const childDocResult = await this.writeChildDoc(ctx, childDoc, skillDir, skillName)
        results.push(childDocResult)
      }
    }

    if (skill.resources != null) { // Write resources
      for (const resource of skill.resources) {
        const resourceResult = await this.writeResource(ctx, resource, skillDir, skillName)
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

  private async writeMcpConfig(
    ctx: OutputWriteContext,
    skill: SkillPrompt,
    skillDir: string
  ): Promise<WriteResult> {
    const skillName = skill.yamlFrontMatter.name
    const mcpConfigPath = this.joinPath(skillDir, MCP_CONFIG_FILE)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: MCP_CONFIG_FILE,
      basePath: skillDir,
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

  private async writeChildDoc(
    ctx: OutputWriteContext,
    childDoc: {relativePath: string, content: unknown},
    skillDir: string,
    skillName: string
  ): Promise<WriteResult> {
    const outputRelativePath = childDoc.relativePath.replace(/\.mdx$/, '.md') // Convert .mdx to .md for output
    const childDocPath = this.joinPath(skillDir, outputRelativePath)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: outputRelativePath,
      basePath: skillDir,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => childDocPath
    }

    const content = childDoc.content as string

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'childDoc', path: childDocPath})
      return {path: relativePath, success: true, skipped: false}
    }

    try {
      const parentDir = this.dirname(childDocPath)
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

  private async writeResource(
    ctx: OutputWriteContext,
    resource: {relativePath: string, content: string, encoding: 'text' | 'base64'},
    skillDir: string,
    skillName: string
  ): Promise<WriteResult> {
    const resourcePath = this.joinPath(skillDir, resource.relativePath)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: resource.relativePath,
      basePath: skillDir,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => resourcePath
    }

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'resource', path: resourcePath})
      return {path: relativePath, success: true, skipped: false}
    }

    try {
      const parentDir = this.dirname(resourcePath)
      this.ensureDirectory(parentDir)

      if (resource.encoding === 'base64') { // Handle binary vs text encoding
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
