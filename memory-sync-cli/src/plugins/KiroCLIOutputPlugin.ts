import type {
  FastCommandPrompt,
  OutputPluginContext,
  OutputWriteContext,
  Project,
  ProjectChildrenMemoryPrompt,
  RegistryOperationResult,
  SkillPrompt,
  SkillYAMLFrontMatter,
  WriteResult,
  WriteResults
} from '@/types'
import type {RelativePath} from '@/types/FileSystemTypes'
import {buildMarkdownWithFrontMatter} from '@truenine/md-compiler/markdown'
import {AbstractOutputPlugin} from './AbstractOutputPlugin'
import {KiroPowersRegistryWriter} from './registry/KiroPowersRegistryWriter'

const GLOBAL_MEMORY_FILE = 'GLOBAL.md'
const GLOBAL_CONFIG_DIR = '.kiro'
const STEERING_SUBDIR = 'steering'
const SETTINGS_SUBDIR = 'settings'
const MCP_CONFIG_FILE = 'mcp.json'
const KIRO_POWERS_DIR = '.kiro/powers/installed'
const POWER_FILE_NAME = 'POWER.md'

export class KiroCLIOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('KiroCLIOutputPlugin', {globalConfigDir: GLOBAL_CONFIG_DIR, outputFileName: GLOBAL_MEMORY_FILE})

    this.registerCleanEffect('registry-cleanup', async ctx => {
      const writer = this.getRegistryWriter(KiroPowersRegistryWriter)
      const success = writer.unregisterLocalPowers(ctx.dryRun)
      if (success) return {success: true, description: 'Reset registry'}
      return {success: false, description: 'Failed', error: new Error('Registry cleanup failed')}
    })

    this.registerCleanEffect('mcp-settings-cleanup', async ctx => {
      const mcpPath = this.joinPath(this.getGlobalSettingsDir(), MCP_CONFIG_FILE)
      const content = JSON.stringify({mcpServers: {}, powers: {mcpServers: {}}}, null, 2)
      if (ctx.dryRun === true) {
        this.log.trace({action: 'dryRun', type: 'mcpSettingsCleanup', path: mcpPath})
        return {success: true, description: 'Would reset mcp.json'}
      }
      const result = await this.writeFile(ctx, mcpPath, content, 'mcpSettingsCleanup')
      if (result.success) return {success: true, description: 'Reset mcp.json'}
      return {success: false, description: 'Failed', error: result.error ?? new Error('Cleanup failed')}
    })
  }

  private getGlobalSettingsDir(): string {
    return this.joinPath(this.getHomeDir(), GLOBAL_CONFIG_DIR, SETTINGS_SUBDIR)
  }

  private getGlobalSteeringDir(): string {
    return this.joinPath(this.getGlobalConfigDir(), STEERING_SUBDIR)
  }

  private getKiroPowersDir(): string {
    return this.joinPath(this.getHomeDir(), KIRO_POWERS_DIR)
  }

  async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const {projects} = ctx.collectedInputContext.workspace
    return projects
      .filter(p => p.dirFromWorkspacePath != null)
      .map(p => this.createRelativePath(
        this.joinPath(p.dirFromWorkspacePath!.path, GLOBAL_CONFIG_DIR, STEERING_SUBDIR),
        p.dirFromWorkspacePath!.basePath,
        () => STEERING_SUBDIR
      ))
  }

  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const {projects} = ctx.collectedInputContext.workspace
    const results: RelativePath[] = []

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null || project.childMemoryPrompts == null) continue
      for (const child of project.childMemoryPrompts) {
        results.push(this.createRelativePath(
          this.joinPath(project.dirFromWorkspacePath.path, GLOBAL_CONFIG_DIR, STEERING_SUBDIR, this.buildSteeringFileName(child)),
          project.dirFromWorkspacePath.basePath,
          () => STEERING_SUBDIR
        ))
      }
    }
    return results
  }

  async registerGlobalOutputDirs(): Promise<RelativePath[]> {
    const results: RelativePath[] = [
      this.createRelativePath(STEERING_SUBDIR, this.getGlobalConfigDir(), () => STEERING_SUBDIR)
    ]

    const powersDir = this.getKiroPowersDir()
    for (const powerName of this.listInstalledPowers(powersDir)) results.push(this.createRelativePath(powerName, powersDir, () => powerName))

    results.push(this.createRelativePath('repos', this.joinPath(this.getHomeDir(), '.kiro/powers'), () => 'repos'))
    return results
  }

  private listInstalledPowers(powersDir: string): string[] {
    try {
      if (!this.existsSync(powersDir)) return []
      return this.readdirSync(powersDir, {withFileTypes: true}).filter(e => e.isDirectory()).map(e => e.name)
    } catch {
      return []
    }
  }

  async registerGlobalOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const {globalMemory, fastCommands, skills} = ctx.collectedInputContext
    const steeringDir = this.getGlobalSteeringDir()
    const results: RelativePath[] = []

    if (globalMemory != null) results.push(this.createRelativePath(GLOBAL_MEMORY_FILE, steeringDir, () => STEERING_SUBDIR))

    if (fastCommands != null) {
      for (const cmd of fastCommands) results.push(this.createRelativePath(this.buildFastCommandSteeringFileName(cmd), steeringDir, () => STEERING_SUBDIR))
    }

    if (skills == null) return results

    const powersDir = this.getKiroPowersDir()
    for (const skill of skills) {
      const skillName = skill.yamlFrontMatter.name
      const skillDir = this.joinPath(powersDir, skillName)

      results.push(this.createRelativePath(POWER_FILE_NAME, skillDir, () => skillName))
      if (skill.mcpConfig != null) results.push(this.createRelativePath(MCP_CONFIG_FILE, skillDir, () => skillName))

      if (skill.childDocs != null) {
        for (const refDoc of skill.childDocs) {
          results.push(this.createRelativePath(
            this.joinPath(STEERING_SUBDIR, refDoc.dir.path.replace(/\.mdx$/, '.md')),
            skillDir,
            () => STEERING_SUBDIR
          ))
        }
      }
      if (skill.resources != null) {
        for (const res of skill.resources) results.push(this.createRelativePath(this.joinPath(STEERING_SUBDIR, res.relativePath), skillDir, () => STEERING_SUBDIR))
      }
    }
    if (skills.some(s => s.mcpConfig != null)) results.push(this.createRelativePath(MCP_CONFIG_FILE, this.getGlobalSettingsDir(), () => SETTINGS_SUBDIR))
    return results
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {workspace, globalMemory, fastCommands, skills} = ctx.collectedInputContext
    const hasChildPrompts = workspace.projects.some(p => (p.childMemoryPrompts?.length ?? 0) > 0)
    if (hasChildPrompts || globalMemory != null || (fastCommands?.length ?? 0) > 0 || (skills?.length ?? 0) > 0) return true
    this.log.trace({action: 'skip', reason: 'noOutputs'})
    return false
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {projects} = ctx.collectedInputContext.workspace
    const fileResults: WriteResult[] = []

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null || project.childMemoryPrompts == null) continue
      for (const child of project.childMemoryPrompts) fileResults.push(await this.writeSteeringFile(ctx, project, child))
    }
    return {files: fileResults, dirs: []}
  }

  async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {globalMemory, fastCommands, skills} = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const registryResults: RegistryOperationResult[] = []
    const steeringDir = this.getGlobalSteeringDir()

    if (globalMemory != null) {
      fileResults.push(await this.writeFile(ctx, this.joinPath(steeringDir, GLOBAL_MEMORY_FILE), globalMemory.content as string, 'globalMemory'))
    }

    if (fastCommands != null) {
      for (const cmd of fastCommands) fileResults.push(await this.writeFastCommandSteeringFile(ctx, cmd))
    }

    if (skills == null || skills.length === 0) return {files: fileResults, dirs: []}

    for (const skill of skills) {
      const {fileResults: skillFiles, registryResult} = await this.writeSkillAsPower(ctx, skill)
      fileResults.push(...skillFiles)
      registryResults.push(registryResult)
    }
    const mcpResult = await this.writeGlobalMcpSettings(ctx, skills)
    if (mcpResult != null) fileResults.push(mcpResult)
    this.logRegistryResults(registryResults, ctx.dryRun)
    return {files: fileResults, dirs: []}
  }

  private async writeGlobalMcpSettings(ctx: OutputWriteContext, skills: readonly SkillPrompt[]): Promise<WriteResult | null> {
    const powersMcpServers: Record<string, unknown> = {}
    for (const skill of skills) {
      if (skill.mcpConfig == null) continue
      for (const [mcpName, config] of Object.entries(skill.mcpConfig.mcpServers)) powersMcpServers[`power-${skill.yamlFrontMatter.name}-${mcpName}`] = config
    }
    if (Object.keys(powersMcpServers).length === 0) return null

    const content = JSON.stringify({mcpServers: {}, powers: {mcpServers: powersMcpServers}}, null, 2)
    return this.writeFile(ctx, this.joinPath(this.getGlobalSettingsDir(), MCP_CONFIG_FILE), content, 'globalMcpSettings')
  }

  private logRegistryResults(results: readonly RegistryOperationResult[], dryRun?: boolean): void {
    const success = results.filter(r => r.success).length
    const fail = results.filter(r => !r.success).length
    if (success > 0) this.log.trace({action: dryRun === true ? 'dryRun' : 'register', type: 'registrySummary', successCount: success})
    if (fail > 0) this.log.error({action: 'register', type: 'registrySummary', failCount: fail})
  }

  private async writeSkillAsPower(ctx: OutputWriteContext, skill: SkillPrompt): Promise<{fileResults: WriteResult[], registryResult: RegistryOperationResult}> {
    const fileResults: WriteResult[] = []
    const skillName = skill.yamlFrontMatter.name
    const powerDir = this.joinPath(this.getKiroPowersDir(), skillName)
    const powerFilePath = this.joinPath(powerDir, POWER_FILE_NAME)

    const fmStr = this.buildPowerFrontMatter(skill.yamlFrontMatter)
    const powerContent = `${fmStr}\n${skill.content as string}`
    fileResults.push(await this.writeFile(ctx, powerFilePath, powerContent, 'skillPower'))

    if (skill.childDocs != null) {
      const steeringDir = this.joinPath(powerDir, STEERING_SUBDIR)
      for (const refDoc of skill.childDocs) {
        const fileName = refDoc.dir.path.replace(/\.mdx$/, '.md')
        fileResults.push(await this.writeFile(ctx, this.joinPath(steeringDir, fileName), refDoc.content as string, 'refDoc'))
      }
    }

    if (skill.resources != null) {
      const steeringDir = this.joinPath(powerDir, STEERING_SUBDIR)
      for (const res of skill.resources) fileResults.push(await this.writeFile(ctx, this.joinPath(steeringDir, res.relativePath), res.content, 'resource'))
    }

    if (skill.mcpConfig != null) fileResults.push(await this.writeFile(ctx, this.joinPath(powerDir, MCP_CONFIG_FILE), skill.mcpConfig.rawContent, 'mcpConfig'))

    const writer = this.getRegistryWriter(KiroPowersRegistryWriter)
    const powerEntry = writer.buildPowerEntry(skill, powerDir)
    const regResults = await this.registerInRegistry(writer, [powerEntry], ctx)
    const registryResult = regResults[0] ?? {success: false, entryName: skillName, error: new Error('No registry result')}

    return {fileResults, registryResult}
  }

  private buildPowerFrontMatter(fm: SkillYAMLFrontMatter): string {
    return buildMarkdownWithFrontMatter({
      name: fm.name,
      displayName: fm.displayName,
      description: fm.description,
      keywords: fm.keywords,
      author: fm.author
    }, '').trimEnd()
  }

  private buildFastCommandSteeringFileName(cmd: FastCommandPrompt): string {
    return this.transformFastCommandName(cmd, {includeSeriesPrefix: true, seriesSeparator: '-'})
  }

  private async writeFastCommandSteeringFile(ctx: OutputWriteContext, cmd: FastCommandPrompt): Promise<WriteResult> {
    const fileName = this.buildFastCommandSteeringFileName(cmd)
    const fullPath = this.joinPath(this.getGlobalSteeringDir(), fileName)
    const desc = cmd.yamlFrontMatter?.description
    const content = buildMarkdownWithFrontMatter({
      inclusion: 'manual',
      description: desc != null && desc.length > 0 ? desc : null
    }, cmd.content)
    return this.writeFile(ctx, fullPath, content, 'fastCommandSteering')
  }

  private buildSteeringFileName(child: ProjectChildrenMemoryPrompt): string {
    const childPath = child.workingChildDirectoryPath?.path ?? child.dir.path
    const normalized = childPath.replaceAll('\\', '/').replaceAll(/^\/+|\/+$/g, '').replaceAll('/', '-')
    return `kiro-${normalized}.md`
  }

  private async writeSteeringFile(ctx: OutputWriteContext, project: Project, child: ProjectChildrenMemoryPrompt): Promise<WriteResult> {
    const projectDir = project.dirFromWorkspacePath!
    const fileName = this.buildSteeringFileName(child)
    const targetDir = this.joinPath(projectDir.basePath, projectDir.path, GLOBAL_CONFIG_DIR, STEERING_SUBDIR)
    const fullPath = this.joinPath(targetDir, fileName)

    const childPath = child.workingChildDirectoryPath?.path ?? child.dir.path
    const content = buildMarkdownWithFrontMatter({
      inclusion: 'fileMatch',
      fileMatchPattern: `${childPath.replaceAll('\\', '/')}/**`
    }, child.content as string)

    return this.writeFile(ctx, fullPath, content, 'steeringFile')
  }
}
