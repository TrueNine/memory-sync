import type {
  FastCommandPrompt,
  FastCommandYAMLFrontMatter,
  OutputPluginContext,
  OutputWriteContext,
  SkillPrompt,
  WriteResult,
  WriteResults
} from 'memory-sync-cli/src/types'
import type {RelativePath} from 'memory-sync-cli/src/types/FileSystemTypes'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {FilePathKind} from 'memory-sync-cli/src/types'
import {AbstractOutputPlugin} from './AbstractOutputPlugin'

const GLOBAL_CONFIG_DIR = '.agent'
const GLOBAL_GEMINI_DIR = '.gemini'
const ANTIGRAVITY_DIR = 'antigravity'
const SKILLS_SUBDIR = 'skills'
const WORKFLOWS_SUBDIR = 'workflows'

const CLEANUP_SUBDIRS = [SKILLS_SUBDIR, WORKFLOWS_SUBDIR] as const

export class AntigravityOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('AntigravityOutputPlugin', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
      outputFileName: '', // No main output file
      dependsOn: ['GeminiCLIOutputPlugin']
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
          getAbsolutePath: () => path.join(project.dirFromWorkspacePath!.basePath, dirPath)
        })
      }
    }

    return results
  }

  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {skills, fastCommands} = ctx.collectedInputContext
    const globalAntigravityDir = path.join(os.homedir(), GLOBAL_GEMINI_DIR, ANTIGRAVITY_DIR)

    if (skills != null) {
      for (const skill of skills) {
        const skillName = skill.yamlFrontMatter?.name ?? skill.dir.getDirectoryName()
        const skillDir = path.join(globalAntigravityDir, SKILLS_SUBDIR, skillName)

        results.push({
          pathKind: FilePathKind.Relative,
          path: 'SKILL.md',
          basePath: skillDir, // For absolute paths, basePath can be the dir
          getDirectoryName: () => skillName,
          getAbsolutePath: () => path.join(skillDir, 'SKILL.md')
        })

        if (skill.childDocs != null) {
          for (const refDoc of skill.childDocs) {
            const refDocFileName = refDoc.dir.path.replace(/\.mdx$/, '.md')
            const refDocPath = path.join(skillDir, refDocFileName)
            results.push({
              pathKind: FilePathKind.Relative,
              path: refDocFileName,
              basePath: skillDir,
              getDirectoryName: () => skillName,
              getAbsolutePath: () => refDocPath
            })
          }
        }

        if (skill.resources != null) {
          for (const resource of skill.resources) {
            const resourcePath = path.join(skillDir, resource.relativePath)
            results.push({
              pathKind: FilePathKind.Relative,
              path: resource.relativePath,
              basePath: skillDir,
              getDirectoryName: () => skillName,
              getAbsolutePath: () => resourcePath
            })
          }
        }
      }
    }

    if (fastCommands == null) return results

    const transformOptions = this.getTransformOptionsFromContext(ctx)
    const workflowsDir = path.join(globalAntigravityDir, WORKFLOWS_SUBDIR)
    for (const cmd of fastCommands) {
      const fileName = this.transformFastCommandName(cmd, transformOptions)
      const fullPath = path.join(workflowsDir, fileName)

      results.push({
        pathKind: FilePathKind.Relative,
        path: fileName,
        basePath: workflowsDir,
        getDirectoryName: () => WORKFLOWS_SUBDIR,
        getAbsolutePath: () => fullPath
      })
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
    const {fastCommands, skills} = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    const globalAntigravityDir = path.join(os.homedir(), GLOBAL_GEMINI_DIR, ANTIGRAVITY_DIR)
    const workflowsDir = path.join(globalAntigravityDir, WORKFLOWS_SUBDIR)
    const skillsDir = path.join(globalAntigravityDir, SKILLS_SUBDIR)

    if (fastCommands != null) {
      for (const cmd of fastCommands) {
        const cmdResults = await this.writeFastCommand(ctx, workflowsDir, cmd)
        fileResults.push(...cmdResults)
      }
    }

    if (skills != null) {
      for (const skill of skills) {
        const skillResults = await this.writeSkill(ctx, skillsDir, skill)
        fileResults.push(...skillResults)
      }
    }

    this.log.info({
      action: 'write',
      message: `Synced ${fileResults.length} files to global directory`,
      files: fileResults.length,
      globalDir: globalAntigravityDir
    })

    return {files: fileResults, dirs: dirResults}
  }

  private async writeFastCommand(
    ctx: OutputWriteContext,
    targetDir: string,
    cmd: FastCommandPrompt
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const transformOptions = this.getTransformOptionsFromContext(ctx) // But we need to filter frontmatter to only include description // Use rawMdxContent if available as Antigravity treats workflows as MD files
    const fileName = this.transformFastCommandName(cmd, transformOptions) // Ideally user wants: .agent/workflows/<name>.md // Antigravity workflow names shouldn't have prefixes usually, but adhering to pipeline standard
    const fullPath = path.join(targetDir, fileName)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: fileName,
      basePath: targetDir,
      getDirectoryName: () => WORKFLOWS_SUBDIR,
      getAbsolutePath: () => fullPath
    }

    let finalContent = cmd.content // Prepare content with filtered front matter
    const sourceFrontMatter = cmd.yamlFrontMatter
    const filteredFrontMatter: Partial<Pick<FastCommandYAMLFrontMatter, 'description'>> = {}

    if (typeof sourceFrontMatter?.description === 'string') {
      filteredFrontMatter.description = sourceFrontMatter.description
    }

    const buildContent = (body: string): string =>
      this.buildMarkdownContentWithRaw(body, filteredFrontMatter, cmd.rawFrontMatter)

    if (cmd.rawMdxContent != null) { // If we have raw MDX content, we prefer that but we need to strip/replace frontmatter
      const contentWithoutFrontMatter = cmd.rawMdxContent.replace(/^---\n[\s\S]*?\n---\n/, '') // Simple regex to strip existing frontmatter if present
      finalContent = buildContent(contentWithoutFrontMatter)
    } else {
      finalContent = buildContent(finalContent) // Fallback to compiled content
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
    targetBaseDir: string,
    skill: SkillPrompt
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const skillName = skill.yamlFrontMatter?.name ?? skill.dir.getDirectoryName()
    const targetDir = path.join(targetBaseDir, skillName)
    const fullPath = path.join(targetDir, 'SKILL.md')

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: 'SKILL.md',
      basePath: targetDir,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => fullPath
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
          const refResults = await this.writeSkillReferenceDocument(ctx, targetDir, skillName, refDoc)
          results.push(...refResults)
        }
      }

      if (skill.resources != null) {
        for (const resource of skill.resources) {
          const refResults = await this.writeSkillResource(ctx, targetDir, skillName, resource)
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
    refDoc: {dir: RelativePath, content: unknown}
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const fileName = refDoc.dir.path.replace(/\.mdx$/, '.md')
    const fullPath = path.join(skillDir, fileName)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: fileName,
      basePath: skillDir,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => fullPath
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
    resource: {relativePath: string, content: string}
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const fullPath = path.join(skillDir, resource.relativePath)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: resource.relativePath,
      basePath: skillDir,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => fullPath
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
