import type {
  OutputPluginContext,
  OutputWriteContext,
  SkillPrompt,
  WriteResult,
  WriteResults
} from '../plugin-core'

import {Buffer} from 'node:buffer'
import {buildMarkdownWithFrontMatter} from '@truenine/md-compiler/markdown'
import {AbstractOutputPlugin} from '../plugin-core'

const PROJECT_SKILLS_DIR = '.agents/skills'
const SKILL_FILE_NAME = 'SKILL.md'
const MCP_CONFIG_FILE = 'mcp.json'

/**
 * Output plugin that writes skills directly to each project's .agents/skills/ directory.
 *
 * Structure:
 * - Project: <project>/.agents/skills/<skill-name>/SKILL.md, mcp.json, child docs, resources
 */
export class GenericSkillsOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('GenericSkillsOutputPlugin', {outputFileName: SKILL_FILE_NAME})
  }

  override async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<string[]> {
    const results: string[] = []
    const {projects} = ctx.collectedOutputContext.workspace
    const {skills} = ctx.collectedOutputContext

    if (skills == null || skills.length === 0) return results

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) continue

      const skillsDir = this.joinPath(project.dirFromWorkspacePath.path, PROJECT_SKILLS_DIR)
      results.push(skillsDir)
    }

    return results
  }

  override async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<string[]> {
    const results: string[] = []
    const {projects} = ctx.collectedOutputContext.workspace
    const {skills} = ctx.collectedOutputContext

    if (skills == null || skills.length === 0) return results

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) continue

      for (const skill of skills) {
        const skillName = skill.yamlFrontMatter.name

        results.push(this.joinPath(PROJECT_SKILLS_DIR, skillName, SKILL_FILE_NAME))

        if (skill.mcpConfig != null) results.push(this.joinPath(PROJECT_SKILLS_DIR, skillName, MCP_CONFIG_FILE))

        if (skill.childDocs != null) {
          for (const childDoc of skill.childDocs) {
            const outputRelativePath = childDoc.relativePath.replace(/\.mdx$/, '.md')
            results.push(this.joinPath(PROJECT_SKILLS_DIR, skillName, outputRelativePath))
          }
        }

        if (skill.resources != null) {
          for (const resource of skill.resources) results.push(this.joinPath(PROJECT_SKILLS_DIR, skillName, resource.relativePath))
        }
      }
    }

    return results
  }

  override async registerGlobalOutputDirs(): Promise<string[]> {
    return []
  }

  override async registerGlobalOutputFiles(): Promise<string[]> {
    return []
  }

  override async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {skills} = ctx.collectedOutputContext
    const {projects} = ctx.collectedOutputContext.workspace

    if (skills == null || skills.length === 0) {
      this.log.trace({action: 'skip', reason: 'noSkills'})
      return false
    }

    if (projects.length !== 0) return true

    this.log.trace({action: 'skip', reason: 'noProjects'})
    return false
  }

  override async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {projects} = ctx.collectedOutputContext.workspace
    const {skills} = ctx.collectedOutputContext
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
        const skillResults = await this.writeSkillToDir(ctx, skill, projectSkillsDir) // 将技能文件直接写入项目目录
        fileResults.push(...skillResults)
      }
    }

    return {files: fileResults, dirs: dirResults}
  }

  override async writeGlobalOutputs(): Promise<WriteResults> {
    return {files: [], dirs: []} // 不再写入全局输出，所有技能文件直接写入项目目录
  }

  private async writeSkillToDir(
    ctx: OutputWriteContext,
    skill: SkillPrompt,
    skillsDir: string
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const skillName = skill.yamlFrontMatter.name
    const skillDir = this.joinPath(skillsDir, skillName)
    const skillFilePath = this.joinPath(skillDir, SKILL_FILE_NAME)

    const frontMatterData = this.buildSkillFrontMatter(skill) // Build SKILL.md content with front matter
    const bodyContent = skill.content as string
    const skillContent = buildMarkdownWithFrontMatter(frontMatterData, bodyContent)

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'skill', path: skillFilePath})
      results.push({path: skillFilePath, success: true, skipped: false})
    } else {
      try {
        this.ensureDirectory(skillDir)
        this.writeFileSync(skillFilePath, skillContent)
        this.log.trace({action: 'write', type: 'skill', path: skillFilePath})
        results.push({path: skillFilePath, success: true})
      }
      catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        this.log.error({action: 'write', type: 'skill', path: skillFilePath, error: errMsg})
        results.push({path: skillFilePath, success: false, error: error as Error})
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
    const mcpConfigPath = this.joinPath(skillDir, MCP_CONFIG_FILE)
    const relativePath = mcpConfigPath

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
    _skillName: string
  ): Promise<WriteResult> {
    const outputRelativePath = childDoc.relativePath.replace(/\.mdx$/, '.md')
    const childDocPath = this.joinPath(skillDir, outputRelativePath)
    const relativePath = childDocPath

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
    _skillName: string
  ): Promise<WriteResult> {
    const resourcePath = this.joinPath(skillDir, resource.relativePath)
    const relativePath = resourcePath

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'resource', path: resourcePath})
      return {path: relativePath, success: true, skipped: false}
    }

    try {
      const parentDir = this.dirname(resourcePath)
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
