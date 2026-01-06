import type {
  FastCommandPrompt,
  OutputPluginContext,
  OutputWriteContext,
  SkillPrompt,
  SubAgentPrompt,
  WriteResult,
  WriteResults,
} from '@/types'
import type { RelativePath } from '@/types/FileSystemTypes'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { FilePathKind } from '@/types'
import { AbstractOutputPlugin } from './AbstractOutputPlugin'

const GLOBAL_MEMORY_FILE = 'AGENTS.md'
const GLOBAL_CONFIG_DIR = '.factory'
const COMMANDS_SUBDIR = 'commands'
const AGENTS_SUBDIR = 'agents'
const SKILLS_SUBDIR = 'skills'

// Directories to clean under .factory/
const CLEANUP_SUBDIRS = [COMMANDS_SUBDIR, AGENTS_SUBDIR, SKILLS_SUBDIR] as const

export class DroidCLIOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('DroidCLIOutputPlugin', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
      outputFileName: GLOBAL_MEMORY_FILE,
    })
  }

  async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const { projects } = ctx.collectedInputContext.workspace

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) continue

      // Register .factory/commands, .factory/agents, .factory/skills for cleanup
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

  // DroidCLI outputs skills to project directories, register skill files for cleanup
  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const { projects } = ctx.collectedInputContext.workspace
    const { skills } = ctx.collectedInputContext

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) continue

      // Register skill files (SKILL.md, reference docs, and resources)
      if (skills != null) {
        for (const skill of skills) {
          const skillName = skill.yamlFrontMatter?.name ?? skill.dir.getDirectoryName()
          const skillDir = path.join(project.dirFromWorkspacePath.path, GLOBAL_CONFIG_DIR, SKILLS_SUBDIR, skillName)

          // Register SKILL.md
          results.push({
            pathKind: FilePathKind.Relative,
            path: path.join(skillDir, 'SKILL.md'),
            basePath: project.dirFromWorkspacePath.basePath,
            getDirectoryName: () => skillName,
            getAbsolutePath: () => path.join(project.dirFromWorkspacePath!.basePath, skillDir, 'SKILL.md'),
          })

          // Register reference documents (convert .mdx to .md)
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

          // Register resource files
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

  async registerGlobalOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const { globalMemory } = ctx.collectedInputContext
    if (globalMemory == null) return []

    const globalDir = this.getGlobalConfigDir()
    return [
      {
        pathKind: FilePathKind.Relative,
        path: GLOBAL_MEMORY_FILE,
        basePath: globalDir,
        getDirectoryName: () => GLOBAL_CONFIG_DIR,
        getAbsolutePath: () => path.join(globalDir, GLOBAL_MEMORY_FILE),
      },
    ]
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const { globalMemory, fastCommands, subAgents, skills } = ctx.collectedInputContext
    const hasGlobalMemory = globalMemory != null
    const hasFastCommands = (fastCommands?.length ?? 0) > 0
    const hasSubAgents = (subAgents?.length ?? 0) > 0
    const hasSkills = (skills?.length ?? 0) > 0

    if (hasGlobalMemory || hasFastCommands || hasSubAgents || hasSkills) return true

    this.log.trace({ action: 'skip', reason: 'noOutputs' })
    return false
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const { projects } = ctx.collectedInputContext.workspace
    const { fastCommands, subAgents, skills } = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath

      if (projectDir == null) continue

      // Write fast commands to .factory/commands/
      if (fastCommands != null) {
        for (const cmd of fastCommands) {
          const cmdResults = await this.writeFastCommand(ctx, projectDir, cmd)
          fileResults.push(...cmdResults)
        }
      }

      // Write sub agents to .factory/agents/
      if (subAgents != null) {
        for (const agent of subAgents) {
          const agentResults = await this.writeSubAgent(ctx, projectDir, agent)
          fileResults.push(...agentResults)
        }
      }

      // Write skills to .factory/skills/
      if (skills != null) {
        for (const skill of skills) {
          const skillResults = await this.writeSkill(ctx, projectDir, skill)
          fileResults.push(...skillResults)
        }
      }
    }

    return { files: fileResults, dirs: dirResults }
  }

  async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const { globalMemory } = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    if (globalMemory == null) return { files: fileResults, dirs: dirResults }

    const globalDir = this.getGlobalConfigDir()
    const fullPath = path.join(globalDir, GLOBAL_MEMORY_FILE)
    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: GLOBAL_MEMORY_FILE,
      basePath: globalDir,
      getDirectoryName: () => GLOBAL_CONFIG_DIR,
      getAbsolutePath: () => fullPath,
    }

    if (ctx.dryRun === true) {
      this.log.trace({ action: 'dryRun', type: 'globalMemory', path: fullPath })
      return {
        files: [{ path: relativePath, success: true, skipped: false }],
        dirs: dirResults,
      }
    }

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

    return { files: fileResults, dirs: dirResults }
  }

  private async writeFastCommand(
    ctx: OutputWriteContext,
    projectDir: RelativePath,
    cmd: FastCommandPrompt,
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    // Use transformFastCommandName with configuration from context
    const transformOptions = this.getTransformOptionsFromContext(ctx)
    const fileName = this.transformFastCommandName(cmd, transformOptions)
    const targetDir = path.join(projectDir.basePath, projectDir.path, GLOBAL_CONFIG_DIR, COMMANDS_SUBDIR)
    const fullPath = path.join(targetDir, fileName)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(projectDir.path, GLOBAL_CONFIG_DIR, COMMANDS_SUBDIR, fileName),
      basePath: projectDir.basePath,
      getDirectoryName: () => COMMANDS_SUBDIR,
      getAbsolutePath: () => fullPath,
    }

    // Build content with front matter, preferring raw if parsed failed
    const content = this.buildMarkdownContentWithRaw(
      cmd.content as string,
      cmd.yamlFrontMatter,
      cmd.rawFrontMatter,
    )

    if (ctx.dryRun === true) {
      this.log.trace({ action: 'dryRun', type: 'fastCommand', path: fullPath })
      return [{ path: relativePath, success: true, skipped: false }]
    }

    try {
      this.ensureDirectory(targetDir)
      fs.writeFileSync(fullPath, content, 'utf8')
      this.log.trace({ action: 'write', type: 'fastCommand', path: fullPath })
      results.push({ path: relativePath, success: true })
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({ action: 'write', type: 'fastCommand', path: fullPath, error: errMsg })
      results.push({ path: relativePath, success: false, error: error as Error })
    }

    return results
  }

  private async writeSubAgent(
    ctx: OutputWriteContext,
    projectDir: RelativePath,
    agent: SubAgentPrompt,
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const fileName = (agent.dir.path.endsWith('.md')) ? agent.dir.path : `${agent.dir.path}.md`
    const targetDir = path.join(projectDir.basePath, projectDir.path, GLOBAL_CONFIG_DIR, AGENTS_SUBDIR)
    const fullPath = path.join(targetDir, fileName)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.join(projectDir.path, GLOBAL_CONFIG_DIR, AGENTS_SUBDIR, fileName),
      basePath: projectDir.basePath,
      getDirectoryName: () => AGENTS_SUBDIR,
      getAbsolutePath: () => fullPath,
    }

    // Build content with front matter, preferring raw if parsed failed
    const content = this.buildMarkdownContentWithRaw(
      agent.content as string,
      agent.yamlFrontMatter,
      agent.rawFrontMatter,
    )

    if (ctx.dryRun === true) {
      this.log.trace({ action: 'dryRun', type: 'subAgent', path: fullPath })
      return [{ path: relativePath, success: true, skipped: false }]
    }

    try {
      this.ensureDirectory(targetDir)
      fs.writeFileSync(fullPath, content, 'utf8')
      this.log.trace({ action: 'write', type: 'subAgent', path: fullPath })
      results.push({ path: relativePath, success: true })
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({ action: 'write', type: 'subAgent', path: fullPath, error: errMsg })
      results.push({ path: relativePath, success: false, error: error as Error })
    }

    return results
  }

  private async writeSkill(
    ctx: OutputWriteContext,
    projectDir: RelativePath,
    skill: SkillPrompt,
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    // skill.dir.path is the skill directory name
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

    // Build front matter with only name and description for Droid CLI
    const simplifiedFrontMatter = skill.yamlFrontMatter != null
      ? { name: skill.yamlFrontMatter.name, description: skill.yamlFrontMatter.description }
      : void 0

    // Build content with simplified front matter
    const content = this.buildMarkdownContent(skill.content as string, simplifiedFrontMatter)

    if (ctx.dryRun === true) {
      this.log.trace({ action: 'dryRun', type: 'skill', path: fullPath })
      return [{ path: relativePath, success: true, skipped: false }]
    }

    try {
      this.ensureDirectory(targetDir)
      fs.writeFileSync(fullPath, content, 'utf8')
      this.log.trace({ action: 'write', type: 'skill', path: fullPath })
      results.push({ path: relativePath, success: true })

      // Write reference documents if any
      if (skill.childDocs != null) {
        for (const refDoc of skill.childDocs) {
          const refResults = await this.writeSkillReferenceDocument(ctx, targetDir, skillName, refDoc, projectDir)
          results.push(...refResults)
        }
      }

      // Write resource files if any
      if (skill.resources != null) {
        for (const resource of skill.resources) {
          const resourceResults = await this.writeSkillResource(ctx, targetDir, skillName, resource, projectDir)
          results.push(...resourceResults)
        }
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({ action: 'write', type: 'skill', path: fullPath, error: errMsg })
      results.push({ path: relativePath, success: false, error: error as Error })
    }

    return results
  }

  private async writeSkillReferenceDocument(
    ctx: OutputWriteContext,
    skillDir: string,
    skillName: string,
    refDoc: { dir: RelativePath, content: unknown },
    projectDir: RelativePath,
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    // Convert .mdx to .md for output
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

  private async writeSkillResource(
    ctx: OutputWriteContext,
    skillDir: string,
    skillName: string,
    resource: { relativePath: string, content: string },
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
