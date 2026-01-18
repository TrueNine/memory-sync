import type {
  FastCommandPrompt,
  OutputPluginContext,
  OutputWriteContext,
  SkillPrompt,
  WriteResult,
  WriteResults,
} from '@/types'
import type {RelativePath} from '@/types/FileSystemTypes'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {FilePathKind} from '@/types'
import {AbstractOutputPlugin} from './AbstractOutputPlugin'

const GLOBAL_CONFIG_DIR = '.agent'
const SKILLS_SUBDIR = 'skills'
const WORKFLOWS_SUBDIR = 'workflows'

const CLEANUP_SUBDIRS = [SKILLS_SUBDIR, WORKFLOWS_SUBDIR] as const

export class AntigravityOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('AntigravityOutputPlugin', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
      outputFileName: '', // No main output file
      dependsOn: ['GeminiCLIOutputPlugin'],
    })
  }

  async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {projects} = ctx.collectedInputContext.workspace

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) continue

      for (const subdir of CLEANUP_SUBDIRS) {
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
      if (project.dirFromWorkspacePath == null) continue

      if (skills != null) {
        for (const skill of skills) {
          const skillName = skill.yamlFrontMatter?.name ?? skill.dir.getDirectoryName()
          const skillDir = path.join(project.dirFromWorkspacePath.path, GLOBAL_CONFIG_DIR, SKILLS_SUBDIR, skillName)

          results.push({
            pathKind: FilePathKind.Relative,
            path: path.join(skillDir, 'SKILL.md'),
            basePath: project.dirFromWorkspacePath.basePath,
            getDirectoryName: () => skillName,
            getAbsolutePath: () => path.join(project.dirFromWorkspacePath!.basePath, skillDir, 'SKILL.md'),
          })

          if (skill.childDocs != null) {
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

          if (skill.resources != null) {
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

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {fastCommands, skills} = ctx.collectedInputContext
    const hasFastCommands = (fastCommands?.length ?? 0) > 0
    const hasSkills = (skills?.length ?? 0) > 0

    if (hasFastCommands || hasSkills) return true

    this.log.trace({action: 'skip', reason: 'noOutputs'})
    return false
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {projects} = ctx.collectedInputContext.workspace
    const {fastCommands, skills} = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath

      if (projectDir == null) continue

      if (fastCommands != null) {
        for (const cmd of fastCommands) {
          const cmdResults = await this.writeFastCommand(ctx, projectDir, cmd)
          fileResults.push(...cmdResults)
        }
      }

      if (skills != null) {
        for (const skill of skills) {
          const skillResults = await this.writeSkill(ctx, projectDir, skill)
          fileResults.push(...skillResults)
        }
      }
    }

    this.log.info({
      action: 'write',
      message: `Synced ${fileResults.length} files to ${projects.length} projects`,
      files: fileResults.length,
      projects: projects.length,
    })

    return {files: fileResults, dirs: dirResults}
  }

  private async writeFastCommand(
    ctx: OutputWriteContext,
    projectDir: RelativePath,
    cmd: FastCommandPrompt,
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const transformOptions = this.getTransformOptionsFromContext(ctx) // But we need to filter frontmatter to only include description // Use rawMdxContent if available as Antigravity treats workflows as MD files
    const fileName = this.transformFastCommandName(cmd, transformOptions) // Ideally user wants: .agent/workflows/<name>.md // Antigravity workflow names shouldn't have prefixes usually, but adhering to pipeline standard
    const targetDir = path.join(projectDir.basePath, projectDir.path, GLOBAL_CONFIG_DIR, WORKFLOWS_SUBDIR)
    const fullPath = path.join(targetDir, fileName)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(projectDir.path, GLOBAL_CONFIG_DIR, WORKFLOWS_SUBDIR, fileName),
      basePath: projectDir.basePath,
      getDirectoryName: () => WORKFLOWS_SUBDIR,
      getAbsolutePath: () => fullPath,
    }

    let finalContent = cmd.content as string // Prepare content with filtered front matter
    const sourceFrontMatter = cmd.yamlFrontMatter
    const filteredFrontMatter: Record<string, unknown> = {}

    if (sourceFrontMatter && typeof sourceFrontMatter.description === 'string') filteredFrontMatter['description'] = sourceFrontMatter.description

    if (cmd.rawMdxContent != null) { // If we have raw MDX content, we prefer that but we need to strip/replace frontmatter
      const contentWithoutFrontMatter = cmd.rawMdxContent.replace(/^---\n[\s\S]*?\n---\n/, '') // Simple regex to strip existing frontmatter if present
      finalContent = this.buildMarkdownContent(contentWithoutFrontMatter, filteredFrontMatter)
    } else {
      finalContent = this.buildMarkdownContent(finalContent, filteredFrontMatter) // Fallback to compiled content
    }

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'fastCommand', path: fullPath})
      return [{path: relativePath, success: true, skipped: false}]
    }

    try {
      this.ensureDirectory(targetDir)
      fs.writeFileSync(fullPath, finalContent, 'utf8')
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

  private async writeSkill(
    ctx: OutputWriteContext,
    projectDir: RelativePath,
    skill: SkillPrompt,
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const skillName = skill.yamlFrontMatter?.name ?? skill.dir.getDirectoryName()
    const targetDir = path.join(projectDir.basePath, projectDir.path, GLOBAL_CONFIG_DIR, SKILLS_SUBDIR, skillName)
    const fullPath = path.join(targetDir, 'SKILL.md')

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(projectDir.path, GLOBAL_CONFIG_DIR, SKILLS_SUBDIR, skillName, 'SKILL.md'),
      basePath: projectDir.basePath,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => fullPath,
    }

    const content = this.buildMarkdownContentWithRaw(skill.content as string, skill.yamlFrontMatter, skill.rawFrontMatter)

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'skill', path: fullPath})
      return [{path: relativePath, success: true, skipped: false}]
    }

    try {
      this.ensureDirectory(targetDir)
      fs.writeFileSync(fullPath, content, 'utf8')
      this.log.trace({action: 'write', type: 'skill', path: fullPath})
      results.push({path: relativePath, success: true})

      if (skill.childDocs != null) {
        for (const refDoc of skill.childDocs) {
          const refResults = await this.writeSkillReferenceDocument(ctx, targetDir, skillName, refDoc, projectDir)
          results.push(...refResults)
        }
      }

      if (skill.resources != null) {
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
    const fileName = refDoc.dir.path.replace(/\.mdx$/, '.md')
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
      const parentDir = path.dirname(fullPath)
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
      const parentDir = path.dirname(fullPath)
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
