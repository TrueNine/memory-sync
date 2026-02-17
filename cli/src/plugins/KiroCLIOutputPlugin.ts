import type {
  FastCommandPrompt,
  OutputPluginContext,
  OutputWriteContext,
  Project,
  ProjectChildrenMemoryPrompt,
  RegistryOperationResult,
  RulePrompt,
  SkillPrompt,
  SkillYAMLFrontMatter,
  WriteResult,
  WriteResults
} from '@/types'
import type {RelativePath} from '@/types/FileSystemTypes'
import {AbstractOutputPlugin} from './AbstractOutputPlugin'
import {KiroPowersRegistryWriter} from './registry/KiroPowersRegistryWriter'

const GLOBAL_MEMORY_FILE = 'GLOBAL.md'
const GLOBAL_CONFIG_DIR = '.kiro'
const STEERING_SUBDIR = 'steering'
const SETTINGS_SUBDIR = 'settings'
const MCP_CONFIG_FILE = 'mcp.json'
const KIRO_POWERS_DIR = '.kiro/powers/installed'
const KIRO_SKILLS_DIR = '.kiro/skills'
const POWER_FILE_NAME = 'POWER.md'
const SKILL_FILE_NAME = 'SKILL.md'
const RULE_FILE_PREFIX = 'rule-'

export class KiroCLIOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('KiroCLIOutputPlugin', {globalConfigDir: GLOBAL_CONFIG_DIR, outputFileName: GLOBAL_MEMORY_FILE, indexignore: '.kiroignore'})

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

  private getKiroSkillsDir(): string {
    return this.joinPath(this.getHomeDir(), KIRO_SKILLS_DIR)
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
    const {rules} = ctx.collectedInputContext
    const results: RelativePath[] = []

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) continue

      if (project.childMemoryPrompts != null) {
        for (const child of project.childMemoryPrompts) {
          results.push(this.createRelativePath(
            this.joinPath(project.dirFromWorkspacePath.path, GLOBAL_CONFIG_DIR, STEERING_SUBDIR, this.buildSteeringFileName(child)),
            project.dirFromWorkspacePath.basePath,
            () => STEERING_SUBDIR
          ))
        }
      }

      const projectRules = rules?.filter(r => r.scope === 'project')
      if (projectRules != null && projectRules.length > 0) {
        for (const rule of projectRules) {
          const fileName = this.buildRuleSteeringFileName(rule)
          results.push(this.createRelativePath(
            this.joinPath(project.dirFromWorkspacePath.path, GLOBAL_CONFIG_DIR, STEERING_SUBDIR, fileName),
            project.dirFromWorkspacePath.basePath,
            () => STEERING_SUBDIR
          ))
        }
      }
    }

    results.push(...this.registerProjectIgnoreOutputFiles(projects))
    return results
  }

  async registerGlobalOutputDirs(): Promise<RelativePath[]> {
    const results: RelativePath[] = [
      this.createRelativePath(STEERING_SUBDIR, this.getGlobalConfigDir(), () => STEERING_SUBDIR)
    ]

    const powersDir = this.getKiroPowersDir()
    for (const powerName of this.listInstalledPowers(powersDir)) results.push(this.createRelativePath(powerName, powersDir, () => powerName))

    const skillsDir = this.getKiroSkillsDir()
    for (const skillName of this.listInstalledPowers(skillsDir)) results.push(this.createRelativePath(skillName, skillsDir, () => skillName))

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
    const {globalMemory, fastCommands, skills, rules} = ctx.collectedInputContext
    const steeringDir = this.getGlobalSteeringDir()
    const results: RelativePath[] = []

    if (globalMemory != null) results.push(this.createRelativePath(GLOBAL_MEMORY_FILE, steeringDir, () => STEERING_SUBDIR))

    if (fastCommands != null) {
      for (const cmd of fastCommands) results.push(this.createRelativePath(this.buildFastCommandSteeringFileName(cmd), steeringDir, () => STEERING_SUBDIR))
    }

    const globalRules = rules?.filter(r => r.scope === 'global')
    if (globalRules != null && globalRules.length > 0) {
      for (const rule of globalRules) results.push(this.createRelativePath(this.buildRuleSteeringFileName(rule), steeringDir, () => STEERING_SUBDIR))
    }

    if (skills == null) return results

    const powersDir = this.getKiroPowersDir()
    const skillsDir = this.getKiroSkillsDir()

    for (const skill of skills) {
      const skillName = skill.yamlFrontMatter.name
      const hasMcp = skill.mcpConfig != null

      if (hasMcp) {
        const skillDir = this.joinPath(powersDir, skillName)
        results.push(this.createRelativePath(POWER_FILE_NAME, skillDir, () => skillName))
        results.push(this.createRelativePath(MCP_CONFIG_FILE, skillDir, () => skillName))

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
      } else {
        const skillDir = this.joinPath(skillsDir, skillName)
        results.push(this.createRelativePath(SKILL_FILE_NAME, skillDir, () => skillName))

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
          for (const res of skill.resources) results.push(this.createRelativePath(res.relativePath, skillDir, () => skillName))
        }
      }
    }
    if (skills.some(s => s.mcpConfig != null)) results.push(this.createRelativePath(MCP_CONFIG_FILE, this.getGlobalSettingsDir(), () => SETTINGS_SUBDIR))
    return results
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {workspace, globalMemory, fastCommands, skills, rules, aiAgentIgnoreConfigFiles} = ctx.collectedInputContext
    const hasChildPrompts = workspace.projects.some(p => (p.childMemoryPrompts?.length ?? 0) > 0)
    const hasRules = (rules?.length ?? 0) > 0
    const hasKiroIgnore = aiAgentIgnoreConfigFiles?.some(f => f.fileName === '.kiroignore') ?? false

    if (hasChildPrompts || globalMemory != null || (fastCommands?.length ?? 0) > 0 || (skills?.length ?? 0) > 0 || hasRules || hasKiroIgnore) return true
    this.log.trace({action: 'skip', reason: 'noOutputs'})
    return false
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {projects} = ctx.collectedInputContext.workspace
    const {rules} = ctx.collectedInputContext
    const fileResults: WriteResult[] = []

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) continue

      if (project.childMemoryPrompts != null) {
        for (const child of project.childMemoryPrompts) fileResults.push(await this.writeSteeringFile(ctx, project, child))
      }

      const projectRules = rules?.filter(r => r.scope === 'project')
      if (projectRules != null && projectRules.length > 0) {
        for (const rule of projectRules) fileResults.push(await this.writeRuleSteeringFile(ctx, project, rule))
      }
    }

    const ignoreResults = await this.writeProjectIgnoreFiles(ctx)
    fileResults.push(...ignoreResults)

    return {files: fileResults, dirs: []}
  }

  async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {globalMemory, fastCommands, skills, rules} = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const registryResults: RegistryOperationResult[] = []
    const steeringDir = this.getGlobalSteeringDir()

    if (globalMemory != null) {
      fileResults.push(await this.writeFile(ctx, this.joinPath(steeringDir, GLOBAL_MEMORY_FILE), globalMemory.content as string, 'globalMemory'))
    }

    if (fastCommands != null) {
      for (const cmd of fastCommands) fileResults.push(await this.writeFastCommandSteeringFile(ctx, cmd))
    }

    const globalRules = rules?.filter(r => r.scope === 'global')
    if (globalRules != null && globalRules.length > 0) {
      for (const rule of globalRules) {
        const fileName = this.buildRuleSteeringFileName(rule)
        const fullPath = this.joinPath(steeringDir, fileName)
        const content = this.buildRuleSteeringContent(rule)
        fileResults.push(await this.writeFile(ctx, fullPath, content, 'ruleSteeringFile'))
      }
    }

    if (skills == null || skills.length === 0) return {files: fileResults, dirs: []}

    const powerSkills = skills.filter(s => s.mcpConfig != null)
    const plainSkills = skills.filter(s => s.mcpConfig == null)

    for (const skill of powerSkills) {
      const {fileResults: skillFiles, registryResult} = await this.writeSkillAsPower(ctx, skill)
      fileResults.push(...skillFiles)
      registryResults.push(registryResult)
    }

    for (const skill of plainSkills) {
      const skillFiles = await this.writeSkillAsKiroSkill(ctx, skill)
      fileResults.push(...skillFiles)
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

  private async writeSkillAsKiroSkill(ctx: OutputWriteContext, skill: SkillPrompt): Promise<WriteResult[]> {
    const fileResults: WriteResult[] = []
    const skillName = skill.yamlFrontMatter.name
    const skillDir = this.joinPath(this.getKiroSkillsDir(), skillName)
    const skillFilePath = this.joinPath(skillDir, SKILL_FILE_NAME)

    const fmStr = this.buildSkillFrontMatter(skill.yamlFrontMatter)
    const skillContent = `${fmStr}\n${skill.content as string}`
    fileResults.push(await this.writeFile(ctx, skillFilePath, skillContent, 'kiroSkill'))

    if (skill.childDocs != null) {
      for (const refDoc of skill.childDocs) {
        const fileName = refDoc.dir.path.replace(/\.mdx$/, '.md')
        fileResults.push(await this.writeFile(ctx, this.joinPath(skillDir, fileName), refDoc.content as string, 'refDoc'))
      }
    }

    if (skill.resources != null) {
      for (const res of skill.resources) fileResults.push(await this.writeFile(ctx, this.joinPath(skillDir, res.relativePath), res.content, 'resource'))
    }

    return fileResults
  }

  private buildSkillFrontMatter(fm: SkillYAMLFrontMatter): string {
    return this.buildMarkdownContent('', {
      name: fm.name,
      description: fm.description,
      ...fm.displayName != null && {displayName: fm.displayName},
      ...fm.keywords != null && fm.keywords.length > 0 && {keywords: fm.keywords},
      ...fm.author != null && {author: fm.author}
    }).trimEnd()
  }

  private buildPowerFrontMatter(fm: SkillYAMLFrontMatter): string {
    return this.buildMarkdownContent('', {
      name: fm.name,
      displayName: fm.displayName,
      description: fm.description,
      keywords: fm.keywords,
      author: fm.author
    }).trimEnd()
  }

  private buildFastCommandSteeringFileName(cmd: FastCommandPrompt): string {
    return this.transformFastCommandName(cmd, {includeSeriesPrefix: true, seriesSeparator: '-'})
  }

  private async writeFastCommandSteeringFile(ctx: OutputWriteContext, cmd: FastCommandPrompt): Promise<WriteResult> {
    const fileName = this.buildFastCommandSteeringFileName(cmd)
    const fullPath = this.joinPath(this.getGlobalSteeringDir(), fileName)
    const desc = cmd.yamlFrontMatter?.description
    const content = this.buildMarkdownContent(cmd.content, {
      inclusion: 'manual',
      description: desc != null && desc.length > 0 ? desc : null
    })
    return this.writeFile(ctx, fullPath, content, 'fastCommandSteering')
  }

  private buildSteeringFileName(child: ProjectChildrenMemoryPrompt): string {
    const childPath = child.workingChildDirectoryPath?.path ?? child.dir.path
    const normalized = childPath.replaceAll('\\', '/').replaceAll(/^\/+|\/+$/g, '').replaceAll('/', '-')
    return `kiro-${normalized}.md`
  }

  private buildRuleSteeringFileName(rule: RulePrompt): string {
    return `${RULE_FILE_PREFIX}${rule.series}-${rule.ruleName}.md`
  }

  private buildRuleSteeringContent(rule: RulePrompt): string {
    const fileMatchPattern = rule.globs.length === 1
      ? rule.globs[0]
      : `{${rule.globs.join(',')}}`

    return this.buildMarkdownContent(rule.content, {
      inclusion: 'fileMatch',
      fileMatchPattern
    })
  }

  private async writeRuleSteeringFile(ctx: OutputWriteContext, project: Project, rule: RulePrompt): Promise<WriteResult> {
    const projectDir = project.dirFromWorkspacePath!
    const fileName = this.buildRuleSteeringFileName(rule)
    const targetDir = this.joinPath(projectDir.basePath, projectDir.path, GLOBAL_CONFIG_DIR, STEERING_SUBDIR)
    const fullPath = this.joinPath(targetDir, fileName)
    const content = this.buildRuleSteeringContent(rule)

    return this.writeFile(ctx, fullPath, content, 'ruleSteeringFile')
  }

  private async writeSteeringFile(ctx: OutputWriteContext, project: Project, child: ProjectChildrenMemoryPrompt): Promise<WriteResult> {
    const projectDir = project.dirFromWorkspacePath!
    const fileName = this.buildSteeringFileName(child)
    const targetDir = this.joinPath(projectDir.basePath, projectDir.path, GLOBAL_CONFIG_DIR, STEERING_SUBDIR)
    const fullPath = this.joinPath(targetDir, fileName)

    const childPath = child.workingChildDirectoryPath?.path ?? child.dir.path
    const content = this.buildMarkdownContent(child.content as string, {
      inclusion: 'fileMatch',
      fileMatchPattern: `${childPath.replaceAll('\\', '/')}/**`
    })

    return this.writeFile(ctx, fullPath, content, 'steeringFile')
  }
}
