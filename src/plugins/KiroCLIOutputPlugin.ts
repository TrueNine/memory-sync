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
  WriteResults,
} from '@/types'
import type {RelativePath} from '@/types/FileSystemTypes'
/**
 * Kiro CLI Output Plugin
 *
 * Kiro Steering Front Matter Format:
 * Steering files are located in `.kiro/steering/*.md`
 *
 * @example Always included (default behavior)
 * ```yaml
 * ---
 * # No front matter needed, or empty front matter
 * ---
 * ```
 *
 * @example Conditionally included when a matching file is read into context
 * ```yaml
 * ---
 * inclusion: fileMatch
 * fileMatchPattern: 'README*'
 * ---
 * ```
 *
 * @example Manually included via context key ('#' in chat)
 * ```yaml
 * ---
 * inclusion: manual
 * ---
 * ```
 *
 * Supported front matter properties:
 * - `inclusion`: 'always' | 'fileMatch' | 'manual' (default: 'always')
 * - `fileMatchPattern`: glob pattern for fileMatch inclusion (e.g. '*.ts', 'src/**')
 */
import {buildMarkdownWithFrontMatter} from '@/markdown'
import {FilePathKind} from '@/types'
import {AbstractOutputPlugin} from './AbstractOutputPlugin'
import {KiroPowersRegistryWriter} from './registry/KiroPowersRegistryWriter'

const GLOBAL_MEMORY_FILE = 'GLOBAL.md'
const GLOBAL_CONFIG_DIR = '.kiro'
const STEERING_SUBDIR = 'steering'
const SETTINGS_SUBDIR = 'settings'
const MCP_CONFIG_FILE = 'mcp.json'

const KIRO_POWERS_DIR = '.kiro/powers/installed' // Kiro Powers constants
const KIRO_POWERS_REPOS_DIR = '.kiro/powers/repos'
const POWER_FILE_NAME = 'POWER.md'

/**
 * Kiro global MCP settings structure
 * Located at ~/.kiro/settings/mcp.json
 *
 * Format:
 * {
 *   "mcpServers": {},
 *   "powers": {
 *     "mcpServers": {
 *       "power-[powerName]-[mcpName]": { ... }
 *     }
 *   }
 * }
 */
interface KiroGlobalMcpSettings {
  mcpServers: Record<string, unknown>
  powers: {
    mcpServers: Record<string, unknown>
  }
}

export class KiroCLIOutputPlugin extends AbstractOutputPlugin { // Therefore, rootMemoryPrompt handling is not needed here. // Kiro supports AGENTS.md at project root, so it relies on AGENTS.md output.
  constructor() {
    super('KiroCLIOutputPlugin', {globalConfigDir: GLOBAL_CONFIG_DIR, outputFileName: GLOBAL_MEMORY_FILE})

    this.registerCleanEffect('registry-cleanup', async ctx => { // Requirements: 6.1, 6.2 // Register clean effect to remove local powers from registry
      const registryWriter = this.getRegistryWriter(KiroPowersRegistryWriter)
      const success = registryWriter.unregisterLocalPowers(ctx.dryRun)
      if (success) return {success: true, description: 'Reset registry to official state'}
      return {success: false, error: new Error('Failed to clean registry'), description: 'Failed to reset registry'}
    })

    this.registerCleanEffect('mcp-settings-cleanup', async ctx => { // Register clean effect to reset global mcp.json to empty shell
      const settingsDir = this.getGlobalSettingsDir()
      const mcpPath = this.joinPath(settingsDir, MCP_CONFIG_FILE)

      const emptyMcpSettings: KiroGlobalMcpSettings = { // Empty shell structure
        mcpServers: {},
        powers: {
          mcpServers: {},
        },
      }

      if (ctx.dryRun === true) {
        this.log.trace({action: 'dryRun', type: 'mcpSettingsCleanup', path: mcpPath})
        return {success: true, description: 'Would reset mcp.json to empty shell'}
      }

      try {
        this.ensureDirectory(settingsDir)
        this.writeFileSync(mcpPath, JSON.stringify(emptyMcpSettings, null, 2))
        this.log.trace({action: 'clean', type: 'mcpSettingsCleanup', path: mcpPath})
        return {success: true, description: 'Reset mcp.json to empty shell'}
      }
      catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        this.log.error({action: 'clean', type: 'mcpSettingsCleanup', path: mcpPath, error: errMsg})
        return {success: false, error: error as Error, description: 'Failed to reset mcp.json'}
      }
    })
  }

  /**
   * Get the absolute path to the global settings directory.
   * @returns The absolute path to ~/.kiro/settings/
   */
  private getGlobalSettingsDir(): string {
    return this.joinPath(this.getHomeDir(), GLOBAL_CONFIG_DIR, SETTINGS_SUBDIR)
  }

  async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {projects} = ctx.collectedInputContext.workspace

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) continue

      const steeringDir = this.joinPath(project.dirFromWorkspacePath.path, GLOBAL_CONFIG_DIR, STEERING_SUBDIR) // Register <project>/.kiro/steering/ for cleanup
      results.push({
        pathKind: FilePathKind.Relative,
        path: steeringDir,
        basePath: project.dirFromWorkspacePath.basePath,
        getDirectoryName: () => STEERING_SUBDIR,
        getAbsolutePath: () => this.joinPath(project.dirFromWorkspacePath!.basePath, steeringDir),
      })
    }

    return results
  }

  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {projects} = ctx.collectedInputContext.workspace

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) continue

      if (project.childMemoryPrompts != null) { // Register steering files for each childMemoryPrompt
        for (const child of project.childMemoryPrompts) {
          const fileName = this.buildSteeringFileName(child)
          const filePath = this.joinPath(project.dirFromWorkspacePath.path, GLOBAL_CONFIG_DIR, STEERING_SUBDIR, fileName)
          results.push({
            pathKind: FilePathKind.Relative,
            path: filePath,
            basePath: project.dirFromWorkspacePath.basePath,
            getDirectoryName: () => STEERING_SUBDIR,
            getAbsolutePath: () => this.joinPath(project.dirFromWorkspacePath!.basePath, filePath),
          })
        }
      }
    }

    return results
  }

  async registerGlobalOutputDirs(): Promise<RelativePath[]> {
    const globalDir = this.getGlobalSteeringDir()
    const results: RelativePath[] = [
      {
        pathKind: FilePathKind.Relative,
        path: STEERING_SUBDIR,
        basePath: this.joinPath(this.getGlobalConfigDir()),
        getDirectoryName: () => STEERING_SUBDIR,
        getAbsolutePath: () => globalDir,
      },
    ]

    const powersDir = this.getKiroPowersDir() // This ensures old/renamed powers are also cleaned up // Register ALL installed powers for cleanup (not just current skills)
    const installedPowers = this.listInstalledPowers(powersDir)

    for (const powerName of installedPowers) {
      const powerDir = this.joinPath(powersDir, powerName)
      results.push({
        pathKind: FilePathKind.Relative,
        path: powerName,
        basePath: powersDir,
        getDirectoryName: () => powerName,
        getAbsolutePath: () => powerDir,
      })
    }

    const reposDir = this.getKiroPowersReposDir() // Register repos directory for cleanup
    results.push({
      pathKind: FilePathKind.Relative,
      path: 'repos',
      basePath: this.joinPath(this.getHomeDir(), '.kiro/powers'),
      getDirectoryName: () => 'repos',
      getAbsolutePath: () => reposDir,
    })

    return results
  }

  /**
   * List all installed power directories in the Kiro powers directory.
   * @param powersDir - The absolute path to the powers installation directory
   * @returns Array of power directory names
   */
  private listInstalledPowers(powersDir: string): string[] {
    try {
      if (!this.existsSync(powersDir)) return []
      const entries = this.readdirSync(powersDir, {withFileTypes: true})
      return entries
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
    }
    catch {
      this.log.debug({action: 'listInstalledPowers', error: 'Failed to read powers directory'})
      return []
    }
  }

  async registerGlobalOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const {globalMemory, fastCommands, skills} = ctx.collectedInputContext
    const results: RelativePath[] = []
    const globalDir = this.getGlobalSteeringDir()

    if (globalMemory != null) {
      results.push({
        pathKind: FilePathKind.Relative,
        path: GLOBAL_MEMORY_FILE,
        basePath: globalDir,
        getDirectoryName: () => STEERING_SUBDIR,
        getAbsolutePath: () => this.joinPath(globalDir, GLOBAL_MEMORY_FILE),
      })
    }

    if (fastCommands != null) { // Register fast command steering files
      for (const cmd of fastCommands) {
        const fileName = this.buildFastCommandSteeringFileName(cmd)
        results.push({
          pathKind: FilePathKind.Relative,
          path: fileName,
          basePath: globalDir,
          getDirectoryName: () => STEERING_SUBDIR,
          getAbsolutePath: () => this.joinPath(globalDir, fileName),
        })
      }
    }

    if (skills == null) return results // Register skill power files (POWER.md, mcp.json, and reference documents)

    const powersDir = this.getKiroPowersDir()
    for (const skill of skills) {
      const skillName = skill.yamlFrontMatter.name
      const skillPowerDir = this.joinPath(powersDir, skillName)

      results.push({ // Register POWER.md
        pathKind: FilePathKind.Relative,
        path: POWER_FILE_NAME,
        basePath: skillPowerDir,
        getDirectoryName: () => skillName,
        getAbsolutePath: () => this.joinPath(skillPowerDir, POWER_FILE_NAME),
      })

      if (skill.mcpConfig != null) { // Register mcp.json if skill has MCP configuration
        results.push({
          pathKind: FilePathKind.Relative,
          path: MCP_CONFIG_FILE,
          basePath: skillPowerDir,
          getDirectoryName: () => skillName,
          getAbsolutePath: () => this.joinPath(skillPowerDir, MCP_CONFIG_FILE),
        })
      }

      if (skill.childDocs != null) { // Register reference documents in steering/ subdirectory (convert .mdx to .md)
        const steeringDir = this.joinPath(skillPowerDir, STEERING_SUBDIR)
        for (const refDoc of skill.childDocs) {
          const refDocFileName = refDoc.dir.path.replace(/\.mdx$/, '.md')
          results.push({
            pathKind: FilePathKind.Relative,
            path: this.joinPath(STEERING_SUBDIR, refDocFileName),
            basePath: skillPowerDir,
            getDirectoryName: () => STEERING_SUBDIR,
            getAbsolutePath: () => this.joinPath(steeringDir, refDocFileName),
          })
        }
      }

      if (skill.resources != null) { // Register resource files in steering/ subdirectory (non-.md files like .kt, .java, .sql, etc.)
        const steeringDir = this.joinPath(skillPowerDir, STEERING_SUBDIR)
        for (const resource of skill.resources) {
          results.push({
            pathKind: FilePathKind.Relative,
            path: this.joinPath(STEERING_SUBDIR, resource.relativePath),
            basePath: skillPowerDir,
            getDirectoryName: () => STEERING_SUBDIR,
            getAbsolutePath: () => this.joinPath(steeringDir, resource.relativePath),
          })
        }
      }
    }
    const hasAnyMcpConfig = skills.some(s => s.mcpConfig != null)
    if (!hasAnyMcpConfig) return results

    const settingsDir = this.getGlobalSettingsDir()
    results.push({
      pathKind: FilePathKind.Relative,
      path: MCP_CONFIG_FILE,
      basePath: settingsDir,
      getDirectoryName: () => SETTINGS_SUBDIR,
      getAbsolutePath: () => this.joinPath(settingsDir, MCP_CONFIG_FILE),
    })
    return results
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {workspace, globalMemory, fastCommands, skills} = ctx.collectedInputContext
    const hasChildPrompts = workspace.projects.some(
      p => (p.childMemoryPrompts?.length ?? 0) > 0,
    )
    const hasGlobalMemory = globalMemory != null
    const hasFastCommands = (fastCommands?.length ?? 0) > 0
    const hasSkills = (skills?.length ?? 0) > 0

    if (hasChildPrompts || hasGlobalMemory || hasFastCommands || hasSkills) return true

    this.log.trace({action: 'skip', reason: 'noOutputs'})
    return false
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {projects} = ctx.collectedInputContext.workspace
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) continue

      if (project.childMemoryPrompts != null) { // Write childMemoryPrompts as steering files
        for (const child of project.childMemoryPrompts) {
          const result = await this.writeSteeringFile(ctx, project, child)
          fileResults.push(result)
        }
      }
    }

    return {files: fileResults, dirs: dirResults}
  }

  async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {globalMemory, fastCommands, skills} = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []
    const registryResults: RegistryOperationResult[] = []

    if (globalMemory != null) { // Write global memory
      const globalDir = this.getGlobalSteeringDir()
      const fullPath = this.joinPath(globalDir, GLOBAL_MEMORY_FILE)
      const relativePath: RelativePath = {
        pathKind: FilePathKind.Relative,
        path: GLOBAL_MEMORY_FILE,
        basePath: globalDir,
        getDirectoryName: () => STEERING_SUBDIR,
        getAbsolutePath: () => fullPath,
      }

      if (ctx.dryRun === true) {
        this.log.trace({action: 'dryRun', type: 'globalMemory', path: fullPath})
        fileResults.push({path: relativePath, success: true, skipped: false})
      } else {
        try {
          this.ensureDirectory(globalDir)
          this.writeFileSync(fullPath, globalMemory.content as string)
          this.log.trace({action: 'write', type: 'globalMemory', path: fullPath})
          fileResults.push({path: relativePath, success: true})
        }
        catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error)
          this.log.error({action: 'write', type: 'globalMemory', path: fullPath, error: errMsg})
          fileResults.push({path: relativePath, success: false, error: error as Error})
        }
      }
    }

    if (fastCommands != null) { // Write fast commands as manual steering files
      for (const cmd of fastCommands) {
        const result = await this.writeFastCommandSteeringFile(ctx, cmd)
        fileResults.push(result)
      }
    }

    if (skills == null || skills.length === 0) return {files: fileResults, dirs: dirResults} // Write skills as Kiro Powers and register in registry

    this.log.debug(`Processing ${skills.length} skills as Kiro Powers`)
    for (const skill of skills) {
      const {fileResults: skillFileResults, registryResult} = await this.writeSkillAsPower(ctx, skill)
      fileResults.push(...skillFileResults)
      registryResults.push(registryResult)
    }
    const globalMcpResult = await this.writeGlobalMcpSettings(ctx, skills)
    if (globalMcpResult != null) fileResults.push(globalMcpResult)
    this.logRegistryResults(registryResults, ctx.dryRun)
    return {files: fileResults, dirs: dirResults}
  }

  /**
   * Write global MCP settings file at ~/.kiro/settings/mcp.json
   * Aggregates all skill MCP configurations into the powers.mcpServers section.
   *
   * Format:
   * {
   *   "mcpServers": {},
   *   "powers": {
   *     "mcpServers": {
   *       "power-[powerName]-[mcpName]": mcpConfig,
   *       ...
   *     }
   *   }
   * }
   *
   * @param ctx - The output write context
   * @param skills - All skill prompts
   * @returns WriteResult or null if no MCP configurations
   */
  private async writeGlobalMcpSettings(
    ctx: OutputWriteContext,
    skills: readonly SkillPrompt[],
  ): Promise<WriteResult | null> {
    const powersMcpServers: Record<string, unknown> = {} // Collect all MCP configurations from skills into powers.mcpServers

    for (const skill of skills) {
      if (skill.mcpConfig == null) continue

      const powerName = skill.yamlFrontMatter.name
      const {mcpServers} = skill.mcpConfig

      for (const [mcpName, mcpConfig] of Object.entries(mcpServers)) { // Add each MCP server with key format: power-[powerName]-[mcpName]
        const key = `power-${powerName}-${mcpName}`
        powersMcpServers[key] = mcpConfig
      }
    }

    if (Object.keys(powersMcpServers).length === 0) return null // Skip if no MCP configurations

    const settingsDir = this.getGlobalSettingsDir()
    const fullPath = this.joinPath(settingsDir, MCP_CONFIG_FILE)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: MCP_CONFIG_FILE,
      basePath: settingsDir,
      getDirectoryName: () => SETTINGS_SUBDIR,
      getAbsolutePath: () => fullPath,
    }

    const globalMcpSettings: KiroGlobalMcpSettings = { // Build global MCP settings structure
      mcpServers: {},
      powers: {
        mcpServers: powersMcpServers,
      },
    }

    const content = JSON.stringify(globalMcpSettings, null, 2)

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'globalMcpSettings', path: fullPath, serverCount: Object.keys(powersMcpServers).length})
      return {path: relativePath, success: true, skipped: false}
    }

    try {
      this.ensureDirectory(settingsDir)
      this.writeFileSync(fullPath, content)
      this.log.trace({action: 'write', type: 'globalMcpSettings', path: fullPath, serverCount: Object.keys(powersMcpServers).length})
      return {path: relativePath, success: true}
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'globalMcpSettings', path: fullPath, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
  }

  /**
   * Log registry operation results.
   * Logs success/failure for each registration attempt.
   *
   * @param results - The registry operation results
   * @param dryRun - Whether this is a dry-run operation
   * @see Requirements 6.4, 6.5
   */
  private logRegistryResults(results: readonly RegistryOperationResult[], dryRun?: boolean): void {
    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    if (successCount > 0) this.log.trace({action: dryRun === true ? 'dryRun' : 'register', type: 'registrySummary', successCount})

    if (failCount <= 0) return

    this.log.error({action: 'register', type: 'registrySummary', failCount})
    for (const result of results) {
      if (!result.success) {
        const errMsg = result.error?.message ?? 'Unknown error'
        this.log.error({action: 'register', type: 'registryEntry', entryName: result.entryName, error: errMsg})
      }
    }
  }

  private getGlobalSteeringDir(): string {
    return this.joinPath(this.getGlobalConfigDir(), STEERING_SUBDIR)
  }

  /**
   * Get the absolute path to the Kiro Powers installation directory.
   * @returns The absolute path to ~/.kiro/powers/installed/
   */
  private getKiroPowersDir(): string {
    return this.joinPath(this.getHomeDir(), KIRO_POWERS_DIR)
  }

  /**
   * Get the absolute path to the Kiro Powers repos directory.
   * @returns The absolute path to ~/.kiro/powers/repos/
   */
  private getKiroPowersReposDir(): string {
    return this.joinPath(this.getHomeDir(), KIRO_POWERS_REPOS_DIR)
  }

  /**
   * Build YAML front matter for Kiro Power POWER.md file.
   * Includes name, description, keywords, displayName, and author if available.
   *
   * @param frontMatter - The skill YAML front matter data
   * @returns YAML front matter string with leading/trailing delimiters
   */
  private buildPowerFrontMatter(frontMatter: SkillYAMLFrontMatter): string {
    const fmData: Record<string, unknown> = {
      name: frontMatter.name,
      displayName: frontMatter.displayName,
      description: frontMatter.description,
      keywords: frontMatter.keywords,
      author: frontMatter.author,
    }

    return buildMarkdownWithFrontMatter(fmData, '').trimEnd()
  }

  /**
   * Write a single skill as a Kiro Power.
   * Creates the power directory, writes POWER.md (with front matter),
   * writes all reference documents, and registers in the Kiro powers registry.
   *
   * @param ctx - The output write context
   * @param skill - The skill prompt to write
   * @returns Object containing file write results and registry operation result
   */
  private async writeSkillAsPower(
    ctx: OutputWriteContext,
    skill: SkillPrompt,
  ): Promise<{fileResults: WriteResult[], registryResult: RegistryOperationResult}> {
    const fileResults: WriteResult[] = []
    const skillName = skill.yamlFrontMatter.name
    const powerDir = this.joinPath(this.getKiroPowersDir(), skillName)
    const powerFilePath = this.joinPath(powerDir, POWER_FILE_NAME)

    const powerRelativePath: RelativePath = { // Create RelativePath for POWER.md
      pathKind: FilePathKind.Relative,
      path: POWER_FILE_NAME,
      basePath: powerDir,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => powerFilePath,
    }

    const frontMatterStr = this.buildPowerFrontMatter(skill.yamlFrontMatter) // Build POWER.md content with front matter
    const bodyContent = skill.content as string
    const powerContent = `${frontMatterStr}\n${bodyContent}`

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'skillPower', path: powerFilePath})
      fileResults.push({path: powerRelativePath, success: true, skipped: false})
    } else {
      try {
        this.ensureDirectory(powerDir)
        this.writeFileSync(powerFilePath, powerContent)
        this.log.trace({action: 'write', type: 'skillPower', path: powerFilePath})
        fileResults.push({path: powerRelativePath, success: true})
      }
      catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        this.log.error({action: 'write', type: 'skillPower', path: powerFilePath, error: errMsg})
        fileResults.push({path: powerRelativePath, success: false, error: error as Error})
      }
    }

    if (skill.childDocs != null) { // Write reference documents to steering/ subdirectory (convert .mdx to .md)
      const steeringDir = this.joinPath(powerDir, STEERING_SUBDIR)

      for (const refDoc of skill.childDocs) {
        const refDocFileName = refDoc.dir.path.replace(/\.mdx$/, '.md') // Convert .mdx to .md for output
        const refDocFilePath = this.joinPath(steeringDir, refDocFileName)

        const refDocRelativePath: RelativePath = {
          pathKind: FilePathKind.Relative,
          path: this.joinPath(STEERING_SUBDIR, refDocFileName),
          basePath: powerDir,
          getDirectoryName: () => STEERING_SUBDIR,
          getAbsolutePath: () => refDocFilePath,
        }

        const refDocContent = refDoc.content as string // Write reference document content (without front matter)

        if (ctx.dryRun === true) {
          this.log.trace({action: 'dryRun', type: 'refDoc', path: refDocFilePath})
          fileResults.push({path: refDocRelativePath, success: true, skipped: false})
        } else {
          try {
            const parentDir = this.dirname(refDocFilePath) // Ensure parent directory exists for nested reference documents
            this.ensureDirectory(parentDir)
            this.writeFileSync(refDocFilePath, refDocContent)
            this.log.trace({action: 'write', type: 'refDoc', path: refDocFilePath})
            fileResults.push({path: refDocRelativePath, success: true})
          }
          catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error)
            this.log.error({action: 'write', type: 'refDoc', path: refDocFilePath, error: errMsg})
            fileResults.push({path: refDocRelativePath, success: false, error: error as Error})
          }
        }
      }
    }

    if (skill.resources != null) { // Write resource files to steering/ subdirectory (non-.md files like .kt, .java, .sql, etc.)
      const steeringDir = this.joinPath(powerDir, STEERING_SUBDIR)

      for (const resource of skill.resources) {
        const resourceFilePath = this.joinPath(steeringDir, resource.relativePath)

        const resourceRelativePath: RelativePath = {
          pathKind: FilePathKind.Relative,
          path: this.joinPath(STEERING_SUBDIR, resource.relativePath),
          basePath: powerDir,
          getDirectoryName: () => STEERING_SUBDIR,
          getAbsolutePath: () => resourceFilePath,
        }

        if (ctx.dryRun === true) {
          this.log.trace({action: 'dryRun', type: 'resource', path: resourceFilePath})
          fileResults.push({path: resourceRelativePath, success: true, skipped: false})
        } else {
          try {
            const parentDir = this.dirname(resourceFilePath) // Ensure parent directory exists for nested resources
            this.ensureDirectory(parentDir)

            this.writeFileSync(resourceFilePath, resource.content) // Write content directly as-is

            this.log.trace({action: 'write', type: 'resource', path: resourceFilePath})
            fileResults.push({path: resourceRelativePath, success: true})
          }
          catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error)
            this.log.error({action: 'write', type: 'resource', path: resourceFilePath, error: errMsg})
            fileResults.push({path: resourceRelativePath, success: false, error: error as Error})
          }
        }
      }
    }

    if (skill.mcpConfig != null) { // Write mcp.json if skill has MCP configuration
      const mcpResult = await this.writeSkillMcpConfig(ctx, skill, powerDir)
      fileResults.push(mcpResult)
    }

    const registryWriter = this.getRegistryWriter(KiroPowersRegistryWriter) // Requirements: 4.3, 4.4, 4.8 // Register in Kiro powers registry after writing POWER.md
    const powerEntry = registryWriter.buildPowerEntry(skill, powerDir)
    const registryResults = await this.registerInRegistry(registryWriter, [powerEntry], ctx)
    const registryResult = registryResults[0] ?? {
      success: false,
      entryName: skillName,
      error: new Error('No registry result returned'),
    }

    return {fileResults, registryResult}
  }

  /**
   * Write MCP configuration for a single skill to its power directory.
   * Writes the skill's mcp.json directly to ~/.kiro/powers/installed/{skill-name}/mcp.json
   *
   * @param ctx - The output write context
   * @param skill - The skill prompt containing MCP configuration
   * @param powerDir - The power directory path
   * @returns WriteResult indicating success or failure
   */
  private async writeSkillMcpConfig(
    ctx: OutputWriteContext,
    skill: SkillPrompt,
    powerDir: string,
  ): Promise<WriteResult> {
    const skillName = skill.yamlFrontMatter.name
    const mcpConfigPath = this.joinPath(powerDir, MCP_CONFIG_FILE)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: MCP_CONFIG_FILE,
      basePath: powerDir,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => mcpConfigPath,
    }

    const mcpConfigContent = skill.mcpConfig!.rawContent // Use the raw content from the skill's mcp.json (preserves original format)

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'mcpConfig', path: mcpConfigPath, skill: skillName})
      return {path: relativePath, success: true, skipped: false}
    }

    try {
      this.ensureDirectory(powerDir)
      this.writeFileSync(mcpConfigPath, mcpConfigContent)
      this.log.trace({action: 'write', type: 'mcpConfig', path: mcpConfigPath, skill: skillName})
      return {path: relativePath, success: true}
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'mcpConfig', path: mcpConfigPath, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
  }

  /**
   * Build steering file name from fast command
   * Uses hyphen separator for Kiro naming conventions (kebab-case)
   * @example 'pe_compile.md' -> 'pe-compile.md'
   * @example 'compile.md' -> 'compile.md'
   */
  private buildFastCommandSteeringFileName(cmd: FastCommandPrompt): string {
    return this.transformFastCommandName(cmd, {includeSeriesPrefix: true, seriesSeparator: '-'})
  }

  /**
   * Build fast command steering file content with manual inclusion front matter
   * Uses manual inclusion mode so users can include via '#' in chat
   */
  private buildFastCommandSteeringContent(cmd: FastCommandPrompt): string {
    const description = cmd.yamlFrontMatter?.description

    const fmData: Record<string, unknown> = {
      inclusion: 'manual',
      description: description != null && description.length > 0 ? description : null,
    }

    return buildMarkdownWithFrontMatter(fmData, cmd.content as string)
  }

  /**
   * Write fast command as a manual steering file to global steering directory
   */
  private async writeFastCommandSteeringFile(
    ctx: OutputWriteContext,
    cmd: FastCommandPrompt,
  ): Promise<WriteResult> {
    const globalDir = this.getGlobalSteeringDir()
    const fileName = this.buildFastCommandSteeringFileName(cmd)
    const fullPath = this.joinPath(globalDir, fileName)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: fileName,
      basePath: globalDir,
      getDirectoryName: () => STEERING_SUBDIR,
      getAbsolutePath: () => fullPath,
    }

    const content = this.buildFastCommandSteeringContent(cmd)

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'fastCommandSteering', path: fullPath})
      return {path: relativePath, success: true, skipped: false}
    }

    try {
      this.ensureDirectory(globalDir)
      this.writeFileSync(fullPath, content)
      this.log.trace({action: 'write', type: 'fastCommandSteering', path: fullPath})
      return {path: relativePath, success: true}
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'fastCommandSteering', path: fullPath, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
  }

  /**
   * Build steering file name from childMemoryPrompt
   * Format: kiro-<folder-path>.md where nested folders use kebab-case separator
   * @example 'src/components' -> 'kiro-src-components.md'
   */
  private buildSteeringFileName(child: ProjectChildrenMemoryPrompt): string {
    const childPath = child.workingChildDirectoryPath?.path ?? child.dir.path
    const normalizedPath = childPath // Replace path separators with kebab-case
      .replaceAll('\\', '/')
      .replaceAll(/^\/+|\/+$/g, '')
      .replaceAll('/', '-')
    return `kiro-${normalizedPath}.md`
  }

  /**
   * Build steering file content with front matter
   * Uses fileMatch inclusion mode with glob pattern based on child directory
   */
  private buildSteeringContent(child: ProjectChildrenMemoryPrompt): string {
    const childPath = child.workingChildDirectoryPath?.path ?? child.dir.path
    const normalizedPath = childPath.replaceAll('\\', '/')

    const fmData: Record<string, unknown> = {
      inclusion: 'fileMatch',
      fileMatchPattern: `${normalizedPath}/**`,
    }

    return buildMarkdownWithFrontMatter(fmData, child.content as string)
  }

  private async writeSteeringFile(
    ctx: OutputWriteContext,
    project: Project,
    child: ProjectChildrenMemoryPrompt,
  ): Promise<WriteResult> {
    const projectDir = project.dirFromWorkspacePath!
    const fileName = this.buildSteeringFileName(child)
    const targetDir = this.joinPath(projectDir.basePath, projectDir.path, GLOBAL_CONFIG_DIR, STEERING_SUBDIR)
    const fullPath = this.joinPath(targetDir, fileName)

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: this.joinPath(projectDir.path, GLOBAL_CONFIG_DIR, STEERING_SUBDIR, fileName),
      basePath: projectDir.basePath,
      getDirectoryName: () => STEERING_SUBDIR,
      getAbsolutePath: () => fullPath,
    }

    const content = this.buildSteeringContent(child)

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'steeringFile', path: fullPath})
      return {path: relativePath, success: true, skipped: false}
    }

    try {
      this.ensureDirectory(targetDir)
      this.writeFileSync(fullPath, content)
      this.log.trace({action: 'write', type: 'steeringFile', path: fullPath})
      return {path: relativePath, success: true}
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'steeringFile', path: fullPath, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
  }
}
