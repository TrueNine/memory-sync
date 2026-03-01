import type {
  FastCommandPrompt,
  OutputPluginContext,
  OutputWriteContext,
  SkillPrompt,
  WriteResult,
  WriteResults
} from '@truenine/plugin-shared'
import type {RelativePath} from '@truenine/plugin-shared/types'
import * as os from 'node:os'
import * as path from 'node:path'
import {AbstractOutputPlugin} from '@truenine/plugin-output-shared'
import {PLUGIN_NAMES} from '@truenine/plugin-shared'

const GLOBAL_CONFIG_DIR = '.agent'
const GLOBAL_GEMINI_DIR = '.gemini'
const ANTIGRAVITY_DIR = 'antigravity'
const SKILLS_SUBDIR = 'skills'
const WORKFLOWS_SUBDIR = 'workflows'
const MCP_CONFIG_FILE = 'mcp_config.json'
const CLEANUP_SUBDIRS = [SKILLS_SUBDIR, WORKFLOWS_SUBDIR] as const

export class AntigravityOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('AntigravityOutputPlugin', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
      outputFileName: '',
      dependsOn: [PLUGIN_NAMES.GeminiCLIOutput]
    })

    this.registerCleanEffect('mcp-config-cleanup', async ctx => {
      const mcpPath = path.join(this.getAntigravityDir(), MCP_CONFIG_FILE)
      const content = JSON.stringify({mcpServers: {}}, null, 2)
      if (ctx.dryRun === true) {
        this.log.trace({action: 'dryRun', type: 'mcpConfigCleanup', path: mcpPath})
        return {success: true, description: 'Would reset mcp_config.json'}
      }
      const result = await this.writeFile(ctx, mcpPath, content, 'mcpConfigCleanup')
      if (result.success) return {success: true, description: 'Reset mcp_config.json'}
      return {success: false, description: 'Failed', error: result.error ?? new Error('Cleanup failed')}
    })
  }

  private getAntigravityDir(): string {
    return path.join(os.homedir(), GLOBAL_GEMINI_DIR, ANTIGRAVITY_DIR)
  }

  async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const {projects} = ctx.collectedInputContext.workspace
    const results: RelativePath[] = []

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) continue
      for (const subdir of CLEANUP_SUBDIRS) {
        results.push(this.createRelativePath(
          path.join(project.dirFromWorkspacePath.path, GLOBAL_CONFIG_DIR, subdir),
          project.dirFromWorkspacePath.basePath,
          () => subdir
        ))
      }
    }
    return results
  }

  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const {skills, fastCommands} = ctx.collectedInputContext
    const baseDir = this.getAntigravityDir()
    const results: RelativePath[] = []

    if (skills != null) {
      for (const skill of skills) {
        const skillName = skill.yamlFrontMatter?.name ?? skill.dir.getDirectoryName()
        const skillDir = path.join(baseDir, SKILLS_SUBDIR, skillName)

        results.push(this.createRelativePath('SKILL.md', skillDir, () => skillName))

        if (skill.childDocs != null) {
          for (const refDoc of skill.childDocs) {
            results.push(this.createRelativePath(
              refDoc.dir.path.replace(/\.mdx$/, '.md'),
              skillDir,
              () => skillName
            ))
          }
        }

        if (skill.resources != null) {
          for (const resource of skill.resources) results.push(this.createRelativePath(resource.relativePath, skillDir, () => skillName))
        }
      }
    }

    if (skills?.some(s => s.mcpConfig != null)) results.push(this.createRelativePath(MCP_CONFIG_FILE, baseDir, () => ANTIGRAVITY_DIR))

    if (fastCommands == null) return results

    const transformOptions = this.getTransformOptionsFromContext(ctx)
    const workflowsDir = path.join(baseDir, WORKFLOWS_SUBDIR)
    for (const cmd of fastCommands) {
      results.push(this.createRelativePath(
        this.transformFastCommandName(cmd, transformOptions),
        workflowsDir,
        () => WORKFLOWS_SUBDIR
      ))
    }
    return results
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {fastCommands, skills} = ctx.collectedInputContext
    if ((fastCommands?.length ?? 0) > 0 || (skills?.length ?? 0) > 0) return true
    this.log.trace({action: 'skip', reason: 'noOutputs'})
    return false
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {fastCommands, skills} = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const baseDir = this.getAntigravityDir()

    if (fastCommands != null) {
      const workflowsDir = path.join(baseDir, WORKFLOWS_SUBDIR)
      for (const cmd of fastCommands) fileResults.push(await this.writeFastCommand(ctx, workflowsDir, cmd))
    }

    if (skills != null) {
      const skillsDir = path.join(baseDir, SKILLS_SUBDIR)
      for (const skill of skills) fileResults.push(...await this.writeSkill(ctx, skillsDir, skill))
      const mcpResult = await this.writeGlobalMcpConfig(ctx, baseDir, skills)
      if (mcpResult != null) fileResults.push(mcpResult)
    }

    this.log.info({action: 'write', message: `Synced ${fileResults.length} files`, globalDir: baseDir})
    return {files: fileResults, dirs: []}
  }

  private async writeGlobalMcpConfig(
    ctx: OutputWriteContext,
    baseDir: string,
    skills: readonly SkillPrompt[]
  ): Promise<WriteResult | null> {
    const mergedServers: Record<string, unknown> = {}

    for (const skill of skills) {
      if (skill.mcpConfig == null) continue
      for (const [name, config] of Object.entries(skill.mcpConfig.mcpServers)) {
        mergedServers[name] = this.transformMcpConfig(config as unknown as Record<string, unknown>)
      }
    }

    if (Object.keys(mergedServers).length === 0) return null

    const fullPath = path.join(baseDir, MCP_CONFIG_FILE)
    const content = JSON.stringify({mcpServers: mergedServers}, null, 2)
    return this.writeFile(ctx, fullPath, content, 'globalMcpConfig')
  }

  private transformMcpConfig(config: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(config)) {
      if (key === 'url') result['serverUrl'] = value
      else if (key === 'type' || key === 'enabled' || key === 'autoApprove') continue
      else result[key] = value
    }
    return result
  }

  private async writeFastCommand(
    ctx: OutputWriteContext,
    targetDir: string,
    cmd: FastCommandPrompt
  ): Promise<WriteResult> {
    const transformOptions = this.getTransformOptionsFromContext(ctx)
    const fileName = this.transformFastCommandName(cmd, transformOptions)
    const fullPath = path.join(targetDir, fileName)

    const filteredFm: {description?: string} = typeof cmd.yamlFrontMatter?.description === 'string'
      ? {description: cmd.yamlFrontMatter.description}
      : {}

    let content: string
    if (cmd.rawMdxContent != null) {
      const body = cmd.rawMdxContent.replace(/^---\n[\s\S]*?\n---\n/, '')
      content = this.buildMarkdownContentWithRaw(body, filteredFm, cmd.rawFrontMatter)
    } else content = this.buildMarkdownContentWithRaw(cmd.content, filteredFm, cmd.rawFrontMatter)

    return this.writeFile(ctx, fullPath, content, 'fastCommand')
  }

  private async writeSkill(
    ctx: OutputWriteContext,
    targetBaseDir: string,
    skill: SkillPrompt
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const skillName = skill.yamlFrontMatter?.name ?? skill.dir.getDirectoryName()
    const skillDir = path.join(targetBaseDir, skillName)
    const skillPath = path.join(skillDir, 'SKILL.md')

    const content = this.buildMarkdownContentWithRaw(skill.content as string, skill.yamlFrontMatter, skill.rawFrontMatter)
    results.push(await this.writeFile(ctx, skillPath, content, 'skill'))

    if (skill.childDocs != null) {
      for (const refDoc of skill.childDocs) {
        const fileName = refDoc.dir.path.replace(/\.mdx$/, '.md')
        results.push(await this.writeFile(ctx, path.join(skillDir, fileName), refDoc.content as string, 'skillRefDoc'))
      }
    }

    if (skill.resources != null) {
      for (const resource of skill.resources) results.push(await this.writeFile(ctx, path.join(skillDir, resource.relativePath), resource.content, 'skillResource'))
    }

    return results
  }
}
