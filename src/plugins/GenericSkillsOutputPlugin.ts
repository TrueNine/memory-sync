import type {
  OutputPluginContext,
  OutputWriteContext,
  SkillPrompt,
  WriteResult,
  WriteResults,
} from '@/types'
import type {RelativePath} from '@/types/FileSystemTypes'

import {Buffer} from 'node:buffer'
import {buildMarkdownWithFrontMatter} from '@/markdown'
import {FilePathKind} from '@/types'
import {AbstractOutputPlugin} from './AbstractOutputPlugin'

const SKILLS_DIR = '.skills'
const SKILL_FILE_NAME = 'SKILL.md'
const MCP_CONFIG_FILE = 'mcp.json'

/**
 * Generic Skills Output Plugin
 *
 * Outputs skills to each project's `.skills/` directory.
 * This provides a universal skill format that can be used by various AI tools.
 *
 * Output structure:
 * ```
 * <project>/.skills/
 *   <skill-name>/
 *     SKILL.md          # Main skill definition with front matter
 *     mcp.json          # MCP configuration (if present)
 *     <childDocs>       # Reference documents (.md files)
 *     <resources>       # Resource files (.kt, .java, .sql, etc.)
 * ```
 */
export class GenericSkillsOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('GenericSkillsOutputPlugin', {globalConfigDir: '', outputFileName: SKILL_FILE_NAME})
  }

  async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {projects} = ctx.collectedInputContext.workspace
    const {skills} = ctx.collectedInputContext

    if (skills == null || skills.length === 0) return results

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) continue

      const skillsDir = this.joinPath(project.dirFromWorkspacePath.path, SKILLS_DIR) // Register <project>/.skills/ for cleanup
      results.push({
        pathKind: FilePathKind.Relative,
        path: skillsDir,
        basePath: project.dirFromWorkspacePath.basePath,
        getDirectoryName: () => SKILLS_DIR,
        getAbsolutePath: () => this.joinPath(project.dirFromWorkspacePath!.basePath, skillsDir),
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

      const projectSkillsDir = this.joinPath(project.dirFromWorkspacePath.basePath, project.dirFromWorkspacePath.path, SKILLS_DIR)

      for (const skill of skills) {
        const skillName = skill.yamlFrontMatter.name
        const skillDir = this.joinPath(projectSkillsDir, skillName)

        results.push({ // Register SKILL.md
          pathKind: FilePathKind.Relative,
          path: this.joinPath(SKILLS_DIR, skillName, SKILL_FILE_NAME),
          basePath: this.joinPath(project.dirFromWorkspacePath.basePath, project.dirFromWorkspacePath.path),
          getDirectoryName: () => skillName,
          getAbsolutePath: () => this.joinPath(skillDir, SKILL_FILE_NAME),
        })

        if (skill.mcpConfig != null) { // Register mcp.json if skill has MCP configuration
          results.push({
            pathKind: FilePathKind.Relative,
            path: this.joinPath(SKILLS_DIR, skillName, MCP_CONFIG_FILE),
            basePath: this.joinPath(project.dirFromWorkspacePath.basePath, project.dirFromWorkspacePath.path),
            getDirectoryName: () => skillName,
            getAbsolutePath: () => this.joinPath(skillDir, MCP_CONFIG_FILE),
          })
        }

        if (skill.childDocs != null) { // Register child docs (convert .mdx to .md)
          for (const childDoc of skill.childDocs) {
            const outputRelativePath = childDoc.relativePath.replace(/\.mdx$/, '.md')
            results.push({
              pathKind: FilePathKind.Relative,
              path: this.joinPath(SKILLS_DIR, skillName, outputRelativePath),
              basePath: this.joinPath(project.dirFromWorkspacePath.basePath, project.dirFromWorkspacePath.path),
              getDirectoryName: () => skillName,
              getAbsolutePath: () => this.joinPath(skillDir, outputRelativePath),
            })
          }
        }

        if (skill.resources != null) { // Register resources
          for (const resource of skill.resources) {
            results.push({
              pathKind: FilePathKind.Relative,
              path: this.joinPath(SKILLS_DIR, skillName, resource.relativePath),
              basePath: this.joinPath(project.dirFromWorkspacePath.basePath, project.dirFromWorkspacePath.path),
              getDirectoryName: () => skillName,
              getAbsolutePath: () => this.joinPath(skillDir, resource.relativePath),
            })
          }
        }
      }
    }

    return results
  }

  async registerGlobalOutputDirs(): Promise<RelativePath[]> {
    return [] // No global outputs for this plugin
  }

  async registerGlobalOutputFiles(): Promise<RelativePath[]> {
    return [] // No global outputs for this plugin
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

      const projectSkillsDir = this.joinPath(project.dirFromWorkspacePath.basePath, project.dirFromWorkspacePath.path, SKILLS_DIR)

      for (const skill of skills) {
        const skillResults = await this.writeSkill(ctx, skill, projectSkillsDir)
        fileResults.push(...skillResults)
      }
    }

    return {files: fileResults, dirs: dirResults}
  }

  async writeGlobalOutputs(): Promise<WriteResults> {
    return {files: [], dirs: []} // No global outputs for this plugin
  }

  /**
   * Write a single skill to the target directory.
   *
   * @param ctx - The output write context
   * @param skill - The skill prompt to write
   * @param skillsDir - The absolute path to the .skills directory
   * @returns Array of WriteResult for all written files
   */
  private async writeSkill(
    ctx: OutputWriteContext,
    skill: SkillPrompt,
    skillsDir: string,
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
      getAbsolutePath: () => skillFilePath,
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

  /**
   * Build front matter data for SKILL.md.
   */
  private buildSkillFrontMatter(skill: SkillPrompt): Record<string, unknown> {
    const fm = skill.yamlFrontMatter
    return {
      name: fm.name,
      description: fm.description,
      ...fm.displayName != null && {displayName: fm.displayName},
      ...fm.keywords != null && fm.keywords.length > 0 && {keywords: fm.keywords},
      ...fm.author != null && {author: fm.author},
      ...fm.version != null && {version: fm.version},
      ...fm.allowTools != null && fm.allowTools.length > 0 && {allowTools: fm.allowTools},
    }
  }

  /**
   * Write MCP configuration file.
   */
  private async writeMcpConfig(
    ctx: OutputWriteContext,
    skill: SkillPrompt,
    skillDir: string,
  ): Promise<WriteResult> {
    const skillName = skill.yamlFrontMatter.name
    const mcpConfigPath = this.joinPath(skillDir, MCP_CONFIG_FILE)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: MCP_CONFIG_FILE,
      basePath: skillDir,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => mcpConfigPath,
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

  /**
   * Write a child document (.md file).
   * Converts .mdx extension to .md for output.
   */
  private async writeChildDoc(
    ctx: OutputWriteContext,
    childDoc: {relativePath: string, content: unknown},
    skillDir: string,
    skillName: string,
  ): Promise<WriteResult> {
    const outputRelativePath = childDoc.relativePath.replace(/\.mdx$/, '.md') // Convert .mdx to .md for output
    const childDocPath = this.joinPath(skillDir, outputRelativePath)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: outputRelativePath,
      basePath: skillDir,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => childDocPath,
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

  /**
   * Write a resource file (non-.md file).
   */
  private async writeResource(
    ctx: OutputWriteContext,
    resource: {relativePath: string, content: string, encoding: 'text' | 'base64'},
    skillDir: string,
    skillName: string,
  ): Promise<WriteResult> {
    const resourcePath = this.joinPath(skillDir, resource.relativePath)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: resource.relativePath,
      basePath: skillDir,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => resourcePath,
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
