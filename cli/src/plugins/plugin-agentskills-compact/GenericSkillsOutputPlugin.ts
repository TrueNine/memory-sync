import type {
  OutputPluginContext,
  OutputWriteContext,
  SkillPrompt,
  WriteResult,
  WriteResults
} from '@truenine/plugin-shared'
import type {RelativePath} from '@truenine/plugin-shared/types'

import {Buffer} from 'node:buffer'
import * as fs from 'node:fs'
import {buildMarkdownWithFrontMatter} from '@truenine/md-compiler/markdown'
import {AbstractOutputPlugin} from '@truenine/plugin-output-shared'
import {FilePathKind} from '@truenine/plugin-shared'

const PROJECT_SKILLS_DIR = '.agents/skills'
const LEGACY_SKILLS_DIR = '.skills' // 旧路径，用于清理
const SKILL_FILE_NAME = 'SKILL.md'
const MCP_CONFIG_FILE = 'mcp.json'

/**
 * Output plugin that writes skills directly to each project's .agents/skills/ directory.
 *
 * Structure:
 * - Project: <project>/.agents/skills/<skill-name>/SKILL.md, mcp.json, child docs, resources
 *
 * Also cleans up legacy .skills/ directories from previous versions.
 */
export class GenericSkillsOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('GenericSkillsOutputPlugin', {outputFileName: SKILL_FILE_NAME})

    this.registerCleanEffect('legacy-global-skills-cleanup', async ctx => { // 向后兼容：clean 时清理旧的 ~/.skills 目录
      const legacyGlobalSkillsDir = this.joinPath(this.getHomeDir(), LEGACY_SKILLS_DIR)
      if (!this.existsSync(legacyGlobalSkillsDir)) return {success: true, description: 'Legacy global skills dir does not exist, nothing to clean'}
      if (ctx.dryRun === true) {
        this.log.trace({action: 'dryRun', type: 'legacyCleanup', path: legacyGlobalSkillsDir})
        return {success: true, description: `Would clean legacy global skills dir: ${legacyGlobalSkillsDir}`}
      }
      try {
        const entries = this.readdirSync(legacyGlobalSkillsDir, {withFileTypes: true}) // 只删除 skill 子目录（避免误删用户其他文件）
        let cleanedCount = 0
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const skillDir = this.joinPath(legacyGlobalSkillsDir, entry.name)
            const skillFile = this.joinPath(skillDir, SKILL_FILE_NAME)
            if (this.existsSync(skillFile)) { // 确认是 skill 目录（包含 SKILL.md）才删除
              fs.rmSync(skillDir, {recursive: true})
              cleanedCount++
            }
          }
        }
        const remainingEntries = this.readdirSync(legacyGlobalSkillsDir) // 如果目录为空则删除目录本身
        if (remainingEntries.length === 0) fs.rmdirSync(legacyGlobalSkillsDir)
        this.log.trace({action: 'clean', type: 'legacySkills', dir: legacyGlobalSkillsDir, cleanedCount})
        return {success: true, description: `Cleaned ${cleanedCount} legacy skills from ${legacyGlobalSkillsDir}`}
      }
      catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        this.log.error({action: 'clean', type: 'legacySkills', dir: legacyGlobalSkillsDir, error: errMsg})
        return {success: false, description: `Failed to clean legacy skills dir`, error: error as Error}
      }
    })
  }

  async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {projects} = ctx.collectedInputContext.workspace
    const {skills} = ctx.collectedInputContext

    if (skills == null || skills.length === 0) return results

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) continue

      const skillsDir = this.joinPath(project.dirFromWorkspacePath.path, PROJECT_SKILLS_DIR) // 注册新的 .agents/skills/ 目录
      results.push({
        pathKind: FilePathKind.Relative,
        path: skillsDir,
        basePath: project.dirFromWorkspacePath.basePath,
        getDirectoryName: () => PROJECT_SKILLS_DIR,
        getAbsolutePath: () => this.joinPath(project.dirFromWorkspacePath!.basePath, skillsDir)
      })

      const legacySkillsDir = this.joinPath(project.dirFromWorkspacePath.path, LEGACY_SKILLS_DIR) // 注册旧的 .skills/ 目录用于清理
      results.push({
        pathKind: FilePathKind.Relative,
        path: legacySkillsDir,
        basePath: project.dirFromWorkspacePath.basePath,
        getDirectoryName: () => LEGACY_SKILLS_DIR,
        getAbsolutePath: () => this.joinPath(project.dirFromWorkspacePath!.basePath, legacySkillsDir)
      })
    }

    return results
  }

  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {projects} = ctx.collectedInputContext.workspace
    const {skills} = ctx.collectedInputContext

    if (skills == null || skills.length === 0) return results

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) continue

      const projectSkillsDir = this.joinPath(
        project.dirFromWorkspacePath.basePath,
        project.dirFromWorkspacePath.path,
        PROJECT_SKILLS_DIR
      )

      for (const skill of skills) {
        const skillName = skill.yamlFrontMatter.name
        const skillDir = this.joinPath(projectSkillsDir, skillName)

        results.push({ // 注册 SKILL.md
          pathKind: FilePathKind.Relative,
          path: this.joinPath(PROJECT_SKILLS_DIR, skillName, SKILL_FILE_NAME),
          basePath: this.joinPath(project.dirFromWorkspacePath.basePath, project.dirFromWorkspacePath.path),
          getDirectoryName: () => skillName,
          getAbsolutePath: () => this.joinPath(skillDir, SKILL_FILE_NAME)
        })

        if (skill.mcpConfig != null) { // 注册 mcp.json（如果有）
          results.push({
            pathKind: FilePathKind.Relative,
            path: this.joinPath(PROJECT_SKILLS_DIR, skillName, MCP_CONFIG_FILE),
            basePath: this.joinPath(project.dirFromWorkspacePath.basePath, project.dirFromWorkspacePath.path),
            getDirectoryName: () => skillName,
            getAbsolutePath: () => this.joinPath(skillDir, MCP_CONFIG_FILE)
          })
        }

        if (skill.childDocs != null) { // 注册 child docs
          for (const childDoc of skill.childDocs) {
            const outputRelativePath = childDoc.relativePath.replace(/\.mdx$/, '.md')
            results.push({
              pathKind: FilePathKind.Relative,
              path: this.joinPath(PROJECT_SKILLS_DIR, skillName, outputRelativePath),
              basePath: this.joinPath(project.dirFromWorkspacePath.basePath, project.dirFromWorkspacePath.path),
              getDirectoryName: () => skillName,
              getAbsolutePath: () => this.joinPath(skillDir, outputRelativePath)
            })
          }
        }

        if (skill.resources != null) { // 注册 resources
          for (const resource of skill.resources) {
            results.push({
              pathKind: FilePathKind.Relative,
              path: this.joinPath(PROJECT_SKILLS_DIR, skillName, resource.relativePath),
              basePath: this.joinPath(project.dirFromWorkspacePath.basePath, project.dirFromWorkspacePath.path),
              getDirectoryName: () => skillName,
              getAbsolutePath: () => this.joinPath(skillDir, resource.relativePath)
            })
          }
        }
      }
    }

    return results
  }

  async registerGlobalOutputDirs(): Promise<RelativePath[]> {
    return [] // 不再使用全局输出目录
  }

  async registerGlobalOutputFiles(): Promise<RelativePath[]> {
    return [] // 不再使用全局输出文件
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

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) continue

      const projectSkillsDir = this.joinPath(
        project.dirFromWorkspacePath.basePath,
        project.dirFromWorkspacePath.path,
        PROJECT_SKILLS_DIR
      )

      for (const skill of skills) {
        const skillResults = await this.writeSkill(ctx, skill, projectSkillsDir) // 将技能文件直接写入项目目录
        fileResults.push(...skillResults)
      }
    }

    return {files: fileResults, dirs: dirResults}
  }

  async writeGlobalOutputs(): Promise<WriteResults> {
    return {files: [], dirs: []} // 不再写入全局输出，所有技能文件直接写入项目目录
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
