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
  YAMLFrontMatter,
} from '@/types'
import type { RelativePath } from '@/types/FileSystemTypes'
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
import os from 'node:os'
import { FilePathKind } from '@/types'
import { AbstractOutputPlugin } from './AbstractOutputPlugin'
import { KiroPowersRegistryWriter } from './registry/KiroPowersRegistryWriter'

const GLOBAL_MEMORY_FILE = 'GLOBAL.md'
const GLOBAL_CONFIG_DIR = '.kiro'
const STEERING_SUBDIR = 'steering'

// Kiro Powers constants
const KIRO_POWERS_DIR = '.kiro/powers/installed'
const POWER_FILE_NAME = 'POWER.md'

/**
 * Kiro steering file front matter
 * @see https://kiro.dev/docs/steering
 */
export interface KiroSteeringYAMLFrontMatter extends YAMLFrontMatter {
  /**
   * Inclusion mode for steering file
   * - 'always': Always included (default)
   * - 'fileMatch': Conditionally included when matching file is read
   * - 'manual': Manually included via context key ('#' in chat)
   */
  readonly inclusion?: 'always' | 'fileMatch' | 'manual'
  /**
   * Glob pattern for fileMatch inclusion mode
   * @example 'README*', '*.ts', 'src/**'
   */
  readonly fileMatchPattern?: string
}

// Kiro supports AGENTS.md at project root, so it relies on AGENTS.md output.
// Therefore, rootMemoryPrompt handling is not needed here.
export class KiroCLIOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('KiroCLIOutputPlugin', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
      outputFileName: GLOBAL_MEMORY_FILE,
    })
  }

  async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const { projects } = ctx.collectedInputContext.workspace

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) {
        continue
      }

      // Register <project>/.kiro/steering/ for cleanup
      const steeringDir = this.joinPath(project.dirFromWorkspacePath.path, GLOBAL_CONFIG_DIR, STEERING_SUBDIR)
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
    const { projects } = ctx.collectedInputContext.workspace

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) {
        continue
      }

      // Register steering files for each childMemoryPrompt
      if (project.childMemoryPrompts != null) {
        for (const child of project.childMemoryPrompts) {
          const fileName = this.buildSteeringFileName(child)
          const filePath = this.joinPath(
            project.dirFromWorkspacePath.path,
            GLOBAL_CONFIG_DIR,
            STEERING_SUBDIR,
            fileName,
          )
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

  async registerGlobalOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
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

    // Register each skill's power directory for cleanup
    const { skills } = ctx.collectedInputContext
    if (skills != null) {
      const powersDir = this.getKiroPowersDir()
      for (const skill of skills) {
        const skillName = skill.yamlFrontMatter.name
        const skillPowerDir = this.joinPath(powersDir, skillName)
        results.push({
          pathKind: FilePathKind.Relative,
          path: skillName,
          basePath: powersDir,
          getDirectoryName: () => skillName,
          getAbsolutePath: () => skillPowerDir,
        })
      }
    }

    return results
  }

  async registerGlobalOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const { globalMemory, fastCommands, skills } = ctx.collectedInputContext
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

    // Register fast command steering files
    if (fastCommands != null) {
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

    // Register skill power files (POWER.md and reference documents)
    if (skills != null) {
      const powersDir = this.getKiroPowersDir()
      for (const skill of skills) {
        const skillName = skill.yamlFrontMatter.name
        const skillPowerDir = this.joinPath(powersDir, skillName)

        // Register POWER.md
        results.push({
          pathKind: FilePathKind.Relative,
          path: POWER_FILE_NAME,
          basePath: skillPowerDir,
          getDirectoryName: () => skillName,
          getAbsolutePath: () => this.joinPath(skillPowerDir, POWER_FILE_NAME),
        })

        // Register reference documents in steering/ subdirectory
        if (skill.referenceDocuments != null) {
          const steeringDir = this.joinPath(skillPowerDir, STEERING_SUBDIR)
          for (const refDoc of skill.referenceDocuments) {
            const refDocFileName = refDoc.dir.path
            results.push({
              pathKind: FilePathKind.Relative,
              path: this.joinPath(STEERING_SUBDIR, refDocFileName),
              basePath: skillPowerDir,
              getDirectoryName: () => STEERING_SUBDIR,
              getAbsolutePath: () => this.joinPath(steeringDir, refDocFileName),
            })
          }
        }
      }
    }

    return results
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const { workspace, globalMemory, fastCommands, skills } = ctx.collectedInputContext
    const hasChildPrompts = workspace.projects.some(
      (p) => (p.childMemoryPrompts?.length ?? 0) > 0,
    )
    const hasGlobalMemory = globalMemory != null
    const hasFastCommands = (fastCommands?.length ?? 0) > 0
    const hasSkills = (skills?.length ?? 0) > 0

    if (!hasChildPrompts && !hasGlobalMemory && !hasFastCommands && !hasSkills) {
      this.log.trace({ action: 'skip', reason: 'noOutputs' })
      return false
    }

    return true
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const { projects } = ctx.collectedInputContext.workspace
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) {
        continue
      }

      // Write childMemoryPrompts as steering files
      if (project.childMemoryPrompts != null) {
        for (const child of project.childMemoryPrompts) {
          const result = await this.writeSteeringFile(ctx, project, child)
          fileResults.push(result)
        }
      }
    }

    return { files: fileResults, dirs: dirResults }
  }

  async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const { globalMemory, fastCommands, skills } = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []
    const registryResults: RegistryOperationResult[] = []

    // Write global memory
    if (globalMemory != null) {
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
        this.log.trace({ action: 'dryRun', type: 'globalMemory', path: fullPath })
        fileResults.push({ path: relativePath, success: true, skipped: false })
      } else {
        try {
          this.ensureDirectory(globalDir)
          this.writeFileSync(fullPath, globalMemory.content as string)
          this.log.trace({ action: 'write', type: 'globalMemory', path: fullPath })
          fileResults.push({ path: relativePath, success: true })
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error)
          this.log.error({ action: 'write', type: 'globalMemory', path: fullPath, error: errMsg })
          fileResults.push({ path: relativePath, success: false, error: error as Error })
        }
      }
    }

    // Write fast commands as manual steering files
    if (fastCommands != null) {
      for (const cmd of fastCommands) {
        const result = await this.writeFastCommandSteeringFile(ctx, cmd)
        fileResults.push(result)
      }
    }

    // Write skills as Kiro Powers and register in registry
    if (skills != null && skills.length > 0) {
      this.log.debug(`Processing ${skills.length} skills as Kiro Powers`)
      for (const skill of skills) {
        const { fileResults: skillFileResults, registryResult } = await this.writeSkillAsPower(ctx, skill)
        fileResults.push(...skillFileResults)
        registryResults.push(registryResult)
      }

      // Log registry operation results (Requirements 6.4, 6.5)
      this.logRegistryResults(registryResults, ctx.dryRun)
    }

    return { files: fileResults, dirs: dirResults }
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
    const successCount = results.filter((r) => r.success).length
    const failCount = results.filter((r) => !r.success).length

    if (successCount > 0) {
      this.log.trace({ action: dryRun === true ? 'dryRun' : 'register', type: 'registrySummary', successCount })
    }

    if (failCount > 0) {
      this.log.error({ action: 'register', type: 'registrySummary', failCount })
      for (const result of results) {
        if (!result.success) {
          const errMsg = result.error?.message ?? 'Unknown error'
          this.log.error({ action: 'register', type: 'registryEntry', entryName: result.entryName, error: errMsg })
        }
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
   * Get the user's home directory.
   * @returns The absolute path to the user's home directory
   */
  private getHomeDir(): string {
    return os.homedir()
  }

  /**
   * Build YAML front matter for Kiro Power POWER.md file.
   * Includes name, description, keywords, displayName, and author if available.
   *
   * @param frontMatter - The skill YAML front matter data
   * @returns YAML front matter string with leading/trailing delimiters
   */
  private buildPowerFrontMatter(frontMatter: SkillYAMLFrontMatter): string {
    const name: string = frontMatter.name
    const description: string = frontMatter.description
    const displayName: string | undefined = frontMatter.displayName
    const keywords: readonly string[] | undefined = frontMatter.keywords
    const author: string | undefined = frontMatter.author

    const lines: string[] = ['---']

    lines.push(`name: "${name}"`)

    if (displayName != null && displayName.length > 0) {
      lines.push(`displayName: "${displayName}"`)
    }

    if (description.length > 0) {
      lines.push(`description: "${description}"`)
    }

    if (keywords != null && keywords.length > 0) {
      const keywordsStr = keywords.map((k) => `"${k}"`).join(', ')
      lines.push(`keywords: [${keywordsStr}]`)
    }

    if (author != null && author.length > 0) {
      lines.push(`author: "${author}"`)
    }

    lines.push('---')
    return lines.join('\n')
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
  ): Promise<{ fileResults: WriteResult[], registryResult: RegistryOperationResult }> {
    const fileResults: WriteResult[] = []
    const skillName = skill.yamlFrontMatter.name
    const powerDir = this.joinPath(this.getKiroPowersDir(), skillName)
    const powerFilePath = this.joinPath(powerDir, POWER_FILE_NAME)

    // Create RelativePath for POWER.md
    const powerRelativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: POWER_FILE_NAME,
      basePath: powerDir,
      getDirectoryName: () => skillName,
      getAbsolutePath: () => powerFilePath,
    }

    // Build POWER.md content with front matter
    const frontMatterStr = this.buildPowerFrontMatter(skill.yamlFrontMatter)
    const bodyContent = skill.content as string
    const powerContent = `${frontMatterStr}\n${bodyContent}`

    if (ctx.dryRun === true) {
      this.log.trace({ action: 'dryRun', type: 'skillPower', path: powerFilePath })
      fileResults.push({ path: powerRelativePath, success: true, skipped: false })
    } else {
      try {
        this.ensureDirectory(powerDir)
        this.writeFileSync(powerFilePath, powerContent)
        this.log.trace({ action: 'write', type: 'skillPower', path: powerFilePath })
        fileResults.push({ path: powerRelativePath, success: true })
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        this.log.error({ action: 'write', type: 'skillPower', path: powerFilePath, error: errMsg })
        fileResults.push({ path: powerRelativePath, success: false, error: error as Error })
      }
    }

    // Write reference documents to steering/ subdirectory
    if (skill.referenceDocuments != null) {
      const steeringDir = this.joinPath(powerDir, STEERING_SUBDIR)

      for (const refDoc of skill.referenceDocuments) {
        const refDocFileName = refDoc.dir.path
        const refDocFilePath = this.joinPath(steeringDir, refDocFileName)

        const refDocRelativePath: RelativePath = {
          pathKind: FilePathKind.Relative,
          path: this.joinPath(STEERING_SUBDIR, refDocFileName),
          basePath: powerDir,
          getDirectoryName: () => STEERING_SUBDIR,
          getAbsolutePath: () => refDocFilePath,
        }

        // Write reference document content (without front matter)
        const refDocContent = refDoc.content as string

        if (ctx.dryRun === true) {
          this.log.trace({ action: 'dryRun', type: 'refDoc', path: refDocFilePath })
          fileResults.push({ path: refDocRelativePath, success: true, skipped: false })
        } else {
          try {
            this.ensureDirectory(steeringDir)
            this.writeFileSync(refDocFilePath, refDocContent)
            this.log.trace({ action: 'write', type: 'refDoc', path: refDocFilePath })
            fileResults.push({ path: refDocRelativePath, success: true })
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error)
            this.log.error({ action: 'write', type: 'refDoc', path: refDocFilePath, error: errMsg })
            fileResults.push({ path: refDocRelativePath, success: false, error: error as Error })
          }
        }
      }
    }

    // Register in Kiro powers registry after writing POWER.md
    // Requirements: 4.3, 4.4, 4.8
    const registryWriter = this.getRegistryWriter(KiroPowersRegistryWriter)
    const powerEntry = registryWriter.buildPowerEntry(skill, powerDir)
    const registryResults = await this.registerInRegistry(registryWriter, [powerEntry], ctx)
    const registryResult = registryResults[0] ?? {
      success: false,
      entryName: skillName,
      error: new Error('No registry result returned'),
    }

    return { fileResults, registryResult }
  }

  /**
   * Build steering file name from fast command
   * Uses hyphen separator for Kiro naming conventions (kebab-case)
   * @example 'pe_compile.md' -> 'pe-compile.md'
   * @example 'compile.md' -> 'compile.md'
   */
  private buildFastCommandSteeringFileName(cmd: FastCommandPrompt): string {
    return this.transformFastCommandName(cmd, {
      includeSeriesPrefix: true,
      seriesSeparator: '-',
    })
  }

  /**
   * Build fast command steering file content with manual inclusion front matter
   * Uses manual inclusion mode so users can include via '#' in chat
   */
  private buildFastCommandSteeringContent(cmd: FastCommandPrompt): string {
    const description = cmd.yamlFrontMatter?.description ?? ''

    // Build front matter with manual inclusion
    const frontMatterLines = [
      '---',
      'inclusion: manual',
    ]

    // Preserve description if available
    if (description.length > 0) {
      frontMatterLines.push(`description: '${description}'`)
    }

    frontMatterLines.push('---')

    const frontMatter = frontMatterLines.join('\n')
    const content = cmd.content as string
    return `${frontMatter}\n${content}`
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
      this.log.trace({ action: 'dryRun', type: 'fastCommandSteering', path: fullPath })
      return { path: relativePath, success: true, skipped: false }
    }

    try {
      this.ensureDirectory(globalDir)
      this.writeFileSync(fullPath, content)
      this.log.trace({ action: 'write', type: 'fastCommandSteering', path: fullPath })
      return { path: relativePath, success: true }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({ action: 'write', type: 'fastCommandSteering', path: fullPath, error: errMsg })
      return { path: relativePath, success: false, error: error as Error }
    }
  }

  /**
   * Build steering file name from childMemoryPrompt
   * Format: kiro-<folder-path>.md where nested folders use kebab-case separator
   * @example 'src/components' -> 'kiro-src-components.md'
   */
  private buildSteeringFileName(child: ProjectChildrenMemoryPrompt): string {
    const childPath = child.workingChildDirectoryPath?.path ?? child.dir.path
    // Replace path separators with kebab-case
    const normalizedPath = childPath
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '')
      .replace(/\//g, '-')
    return `kiro-${normalizedPath}.md`
  }

  /**
   * Build steering file content with front matter
   * Uses fileMatch inclusion mode with glob pattern based on child directory
   */
  private buildSteeringContent(child: ProjectChildrenMemoryPrompt): string {
    const childPath = child.workingChildDirectoryPath?.path ?? child.dir.path
    const normalizedPath = childPath.replace(/\\/g, '/')

    // Build front matter with fileMatch inclusion
    const frontMatter = [
      '---',
      'inclusion: fileMatch',
      `fileMatchPattern: '${normalizedPath}/**'`,
      '---',
    ].join('\n')

    const content = child.content as string
    return `${frontMatter}\n${content}`
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
      this.log.trace({ action: 'dryRun', type: 'steeringFile', path: fullPath })
      return { path: relativePath, success: true, skipped: false }
    }

    try {
      this.ensureDirectory(targetDir)
      this.writeFileSync(fullPath, content)
      this.log.trace({ action: 'write', type: 'steeringFile', path: fullPath })
      return { path: relativePath, success: true }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({ action: 'write', type: 'steeringFile', path: fullPath, error: errMsg })
      return { path: relativePath, success: false, error: error as Error }
    }
  }
}
