import type {Buffer} from 'node:buffer'
import type {ILogger} from '@/log'

import type {ParsedMarkdown} from '@/markdown'
import type {
  Awaitable,
  CollectedInputContext,
  InputPlugin,
  InputPluginContext,
  PluginOptions,
  YAMLFrontMatter,
} from '@/types'
import {spawn} from 'node:child_process'

import * as os from 'node:os'
import * as path from 'node:path'
import process from 'node:process'
import {PathPlaceholders} from '@/constants'
import {parseMarkdown} from '@/markdown'
import {PluginKind} from '@/types'
import {AbstractPlugin} from './AbstractPlugin'

/**
 * Result of executing an input effect.
 * Used for preprocessing/cleaning input sources before collection.
 */
export interface InputEffectResult {
  /** Whether the effect executed successfully */
  readonly success: boolean
  /** Error details if the effect failed */
  readonly error?: Error
  /** Description of what the effect did (for logging) */
  readonly description?: string
  /** Files that were modified/created */
  readonly modifiedFiles?: readonly string[]
  /** Files that were deleted */
  readonly deletedFiles?: readonly string[]
}

/**
 * Context provided to input effect handlers.
 * Contains utilities and configuration for effect execution.
 */
export interface InputEffectContext {
  /** Logger instance */
  readonly logger: ILogger
  /** File system module */
  readonly fs: typeof import('node:fs')
  /** Path module */
  readonly path: typeof import('node:path')
  /** Glob module for file matching */
  readonly glob: typeof import('fast-glob')
  /** Child process spawn function */
  readonly spawn: typeof import('node:child_process').spawn
  /** User configuration options */
  readonly userConfigOptions: PluginOptions
  /** Resolved workspace directory */
  readonly workspaceDir: string
  /** Resolved shadow project directory */
  readonly shadowProjectDir: string
  /** Whether running in dry-run mode */
  readonly dryRun?: boolean
}

/**
 * Handler function for input effects.
 * Receives the effect context and returns an effect result.
 */
export type InputEffectHandler = (ctx: InputEffectContext) => Awaitable<InputEffectResult>

/**
 * Registration entry for an input effect.
 */
export interface InputEffectRegistration {
  /** Descriptive name for logging */
  readonly name: string
  /** The effect handler function */
  readonly handler: InputEffectHandler
  /** Priority for execution order (lower = earlier, default: 0) */
  readonly priority?: number
}

/**
 * Result of resolving base paths from plugin options.
 */
export interface ResolvedBasePaths {
  /** The resolved workspace directory path */
  readonly workspaceDir: string
  /** The resolved shadow project directory path */
  readonly shadowProjectDir: string
}

/**
 * Represents a registered scope entry from a plugin.
 */
export interface PluginScopeRegistration {
  /** The namespace name (e.g., 'myPlugin') */
  readonly namespace: string
  /** Key-value pairs registered under this namespace */
  readonly values: Record<string, unknown>
}

/**
 * Abstract base class for input plugins.
 * Provides common functionality for collecting data from the file system.
 * Supports effect registration for preprocessing/cleaning input sources.
 * Supports scope registration for MDX expression evaluation.
 *
 * @example
 * ```typescript
 * class MyInputPlugin extends AbstractInputPlugin {
 *   constructor() {
 *     super('MyInputPlugin')
 *     // Register effects in constructor
 *     this.registerEffect('compile-skills', async (ctx) => {
 *       // Compile skill scripts
 *       return { success: true, description: 'Compiled skills' }
 *     })
 *   }
 *
 *   collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
 *     const { workspaceDir, shadowProjectDir } = this.resolveBasePaths(ctx.userConfigOptions)
 *     // Register custom scope variables
 *     this.registerScope('myPlugin', { version: '1.0.0' })
 *     // ... collect data
 *     return { ... }
 *   }
 * }
 * ```
 */
export abstract class AbstractInputPlugin extends AbstractPlugin<PluginKind.Input> implements InputPlugin {
  /**
   * Registered input effects to be executed before collect().
   * Effects are executed in priority order (lower priority = earlier execution).
   */
  private readonly inputEffects: InputEffectRegistration[] = []

  /**
   * Registered scope variables for MDX expression evaluation.
   * These are collected by PluginPipeline and merged into the global scope.
   */
  private readonly registeredScopes: PluginScopeRegistration[] = []

  /**
   * Creates a new AbstractInputPlugin instance.
   * Automatically sets the plugin type to PluginKind.Input.
   *
   * @param name - The unique name of the plugin
   * @param dependsOn - Optional array of plugin names this plugin depends on
   */
  protected constructor(name: string, dependsOn?: readonly string[]) {
    super(name, PluginKind.Input, dependsOn)
  }

  /**
   * Register an input effect to be executed before collect().
   * Effects are executed in priority order (lower priority = earlier execution).
   *
   * @param name - Descriptive name for logging purposes
   * @param handler - The effect handler function
   * @param priority - Execution priority (lower = earlier, default: 0)
   *
   * @example
   * ```typescript
   * // Register a compile effect with high priority (runs early)
   * this.registerEffect('compile-skills', async (ctx) => {
   *   await compileSkillScripts(ctx.shadowProjectDir)
   *   return { success: true, description: 'Compiled skill scripts' }
   * }, -10)
   *
   * // Register a cleanup effect with default priority
   * this.registerEffect('cleanup-stale-dist', async (ctx) => {
   *   const deleted = await cleanupStaleDist(ctx)
   *   return { success: true, deletedFiles: deleted }
   * })
   * ```
   */
  protected registerEffect(name: string, handler: InputEffectHandler, priority: number = 0): void {
    this.inputEffects.push({name, handler, priority})
    // Sort by priority (lower = earlier)
    this.inputEffects.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
  }

  /**
   * Execute all registered input effects sequentially.
   * Effects are executed in priority order (lower priority = earlier execution).
   * Errors are caught and logged, but execution continues with remaining effects.
   *
   * @param ctx - The input plugin context
   * @param dryRun - Whether to run in dry-run mode (no actual changes)
   * @returns Array of effect results, one for each registered effect
   *
   * @example
   * ```typescript
   * // Execute effects before collection
   * const results = await this.executeEffects(ctx)
   * const allSucceeded = results.every(r => r.success)
   * ```
   */
  async executeEffects(ctx: InputPluginContext, dryRun: boolean = false): Promise<InputEffectResult[]> {
    const results: InputEffectResult[] = []

    if (this.inputEffects.length === 0) return results

    const {workspaceDir, shadowProjectDir} = this.resolveBasePaths(ctx.userConfigOptions)

    const effectCtx: InputEffectContext = {
      logger: this.log,
      fs: ctx.fs,
      path: ctx.path,
      glob: ctx.glob,
      spawn,
      userConfigOptions: ctx.userConfigOptions,
      workspaceDir,
      shadowProjectDir,
      dryRun,
    }

    for (const effect of this.inputEffects) {
      if (dryRun) {
        this.log.trace({action: 'dryRun', type: 'inputEffect', name: effect.name})
        results.push({success: true, description: `Would execute input effect: ${effect.name}`})
        continue
      }

      try {
        const result = await effect.handler(effectCtx)
        if (result.success) {
          this.log.trace({action: 'inputEffect', name: effect.name, status: 'success', description: result.description})
          if (result.modifiedFiles != null && result.modifiedFiles.length > 0) {
            this.log.debug({action: 'inputEffect', name: effect.name, modifiedFiles: result.modifiedFiles})
          }
          if (result.deletedFiles != null && result.deletedFiles.length > 0) {
            this.log.debug({action: 'inputEffect', name: effect.name, deletedFiles: result.deletedFiles})
          }
        } else {
          const errorMsg = result.error instanceof Error ? result.error.message : String(result.error)
          this.log.error({action: 'inputEffect', name: effect.name, status: 'failed', error: errorMsg})
        }
        results.push(result)
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        this.log.error({action: 'inputEffect', name: effect.name, status: 'failed', error: errorMsg})
        results.push({success: false, error: error as Error, description: `Input effect failed: ${effect.name}`})
      }
    }

    return results
  }

  /**
   * Check if this plugin has any registered effects.
   *
   * @returns True if effects are registered, false otherwise
   */
  hasEffects(): boolean {
    return this.inputEffects.length > 0
  }

  /**
   * Get the count of registered effects.
   *
   * @returns Number of registered effects
   */
  getEffectCount(): number {
    return this.inputEffects.length
  }

  // ============================================================================
  // Scope Registration Methods
  // ============================================================================

  /**
   * Register custom scope variables for MDX expression evaluation.
   * These variables will be available in MDX templates under the specified namespace.
   *
   * @param namespace - The namespace name (e.g., 'myPlugin')
   * @param values - Key-value pairs to register under this namespace
   *
   * @example
   * ```typescript
   * // Register plugin-specific variables
   * this.registerScope('myPlugin', {
   *   version: '1.0.0',
   *   config: { debug: true }
   * })
   * // In MDX: {myPlugin.version}, {myPlugin.config.debug}
   * ```
   */
  protected registerScope(namespace: string, values: Record<string, unknown>): void {
    this.registeredScopes.push({namespace, values})
    this.log.debug({action: 'registerScope', namespace, keys: Object.keys(values)})
  }

  /**
   * Get all registered scope variables.
   * Called by PluginPipeline to collect scopes from all plugins.
   *
   * @returns Readonly array of scope registrations
   */
  getRegisteredScopes(): readonly PluginScopeRegistration[] {
    return this.registeredScopes
  }

  /**
   * Clear all registered scope variables.
   * Useful for resetting state between test runs or re-collection.
   */
  protected clearRegisteredScopes(): void {
    this.registeredScopes.length = 0
    this.log.debug({action: 'clearRegisteredScopes'})
  }

  /**
   * Collect data from the file system.
   * Subclasses must implement this method to define their collection logic.
   * Supports both sync and async implementations.
   *
   * @param ctx - The input plugin context containing configuration and utilities
   * @returns Partial collected input context with the data gathered by this plugin
   */
  abstract collect(ctx: InputPluginContext): Partial<CollectedInputContext> | Promise<Partial<CollectedInputContext>>

  /**
   * Resolve base paths (workspace and shadow source project directories) from plugin options.
   * Handles path placeholders like ~, $WORKSPACE, and $SHADOW_SOURCE_PROJECT.
   *
   * @param options - The plugin options containing path configurations
   * @returns Object containing resolved workspaceDir and shadowProjectDir
   *
   * @example
   * ```typescript
   * const { workspaceDir, shadowProjectDir } = this.resolveBasePaths(ctx.userConfigOptions)
   * ```
   */
  protected resolveBasePaths(options: Required<PluginOptions>): ResolvedBasePaths {
    const workspaceDirRaw = options.workspaceDir
    const workspaceDir = this.resolvePath(workspaceDirRaw, '', '')

    const shadowProjectDirRaw = options.shadowSourceProjectDir
    const shadowProjectDir = this.resolvePath(shadowProjectDirRaw, workspaceDir, '')

    return {workspaceDir, shadowProjectDir}
  }

  /**
   * Resolve a raw path string by replacing placeholders with actual values.
   * Supports the following placeholders:
   * - `~`: User home directory
   * - `$WORKSPACE`: Workspace directory
   * - `$SHADOW_SOURCE_PROJECT`: Shadow source project directory
   *
   * @param rawPath - The raw path string potentially containing placeholders
   * @param workspaceDir - The resolved workspace directory
   * @param shadowProjectDir - The resolved shadow project directory
   * @returns The fully resolved and normalized path
   *
   * @example
   * ```typescript
   * const resolved = this.resolvePath('$SHADOW_SOURCE_PROJECT/dist/skills', workspaceDir, shadowProjectDir)
   * ```
   */
  protected resolvePath(rawPath: string, workspaceDir: string, shadowProjectDir: string): string {
    let resolved = rawPath

    if (resolved.startsWith(PathPlaceholders.USER_HOME)) resolved = resolved.replace(PathPlaceholders.USER_HOME, os.homedir())

    if (resolved.includes(PathPlaceholders.SHADOW_SOURCE_PROJECT)) resolved = resolved.replace(PathPlaceholders.SHADOW_SOURCE_PROJECT, shadowProjectDir)

    if (resolved.includes(PathPlaceholders.WORKSPACE)) resolved = resolved.replace(PathPlaceholders.WORKSPACE, workspaceDir)

    return path.normalize(resolved)
  }

  /**
   * Read a file and parse it as markdown with YAML front matter.
   * Combines file reading and markdown parsing into a single utility method.
   *
   * @template T - The type of the YAML front matter object
   * @param filePath - The absolute path to the markdown file
   * @param fs - The file system module to use for reading
   * @returns Parsed markdown object containing front matter and content
   * @throws Error if the file cannot be read or parsed
   *
   * @example
   * ```typescript
   * const parsed = this.readAndParseMarkdown<MyFrontMatter>(filePath, ctx.fs)
   * const content = parsed.contentWithoutFrontMatter
   * const frontMatter = parsed.yamlFrontMatter
   * ```
   */
  protected readAndParseMarkdown<T extends YAMLFrontMatter>(
    filePath: string,
    fs: typeof import('node:fs'),
  ): ParsedMarkdown<T> {
    const rawContent = fs.readFileSync(filePath, 'utf8')
    return parseMarkdown<T>(rawContent)
  }
}

// ============================================================================
// Effect Utility Functions
// ============================================================================
// These functions are designed to be used within effect handlers for common
// side-effect operations like cleaning stale files, syncing directories, etc.

/**
 * Options for cleaning stale dist files.
 */
export interface CleanStaleDistOptions {
  /** Source directory (e.g., src/skills) */
  readonly srcDir: string
  /** Distribution directory (e.g., dist/skills) */
  readonly distDir: string
  /** File extension to match (default: '.md') */
  readonly extension?: string
  /** Whether to run in dry-run mode */
  readonly dryRun?: boolean
  /** Logger instance */
  readonly logger?: ILogger | undefined
}

/**
 * Result of cleaning stale dist files.
 */
export interface CleanStaleDistResult {
  /** Files that were deleted */
  readonly deletedFiles: string[]
  /** Files that would be deleted (dry-run mode) */
  readonly wouldDelete: string[]
  /** Errors encountered during deletion */
  readonly errors: {file: string, error: Error}[]
}

/**
 * Clean stale files in dist directory that don't have corresponding source files.
 * Compares dist directory against src directory and removes orphaned files.
 *
 * @param ctx - Effect context containing fs and path modules
 * @param options - Configuration options
 * @returns Result containing deleted files and any errors
 *
 * @example
 * ```typescript
 * this.registerEffect('cleanup-stale-skills', async (ctx) => {
 *   const result = await cleanStaleDistFiles(ctx, {
 *     srcDir: path.join(ctx.shadowProjectDir, 'src/skills'),
 *     distDir: path.join(ctx.shadowProjectDir, 'dist/skills'),
 *   })
 *   return {
 *     success: result.errors.length === 0,
 *     deletedFiles: result.deletedFiles,
 *     description: `Cleaned ${result.deletedFiles.length} stale files`,
 *   }
 * })
 * ```
 */
export function cleanStaleDistFiles(
  ctx: Pick<InputEffectContext, 'fs' | 'path' | 'logger'>,
  options: CleanStaleDistOptions,
): CleanStaleDistResult {
  const {srcDir, distDir, extension = '.md', dryRun = false, logger} = options
  const {fs, path: nodePath} = ctx

  const result: CleanStaleDistResult = {
    deletedFiles: [],
    wouldDelete: [],
    errors: [],
  }

  // Check if directories exist
  if (!fs.existsSync(distDir)) {
    logger?.debug({action: 'cleanStaleDistFiles', message: 'dist directory does not exist', distDir})
    return result
  }

  if (!fs.existsSync(srcDir)) {
    logger?.debug({action: 'cleanStaleDistFiles', message: 'src directory does not exist', srcDir})
    return result
  }

  // Get all files in dist directory
  const distEntries = fs.readdirSync(distDir, {withFileTypes: true})

  for (const entry of distEntries) {
    if (entry.isDirectory()) {
      // For directories, check if corresponding src directory exists
      const srcSubDir = nodePath.join(srcDir, entry.name)
      const distSubDir = nodePath.join(distDir, entry.name)

      if (!fs.existsSync(srcSubDir)) {
        // Source directory doesn't exist, mark for deletion
        if (dryRun) {
          result.wouldDelete.push(distSubDir)
          logger?.debug({action: 'cleanStaleDistFiles', wouldDelete: distSubDir})
        } else {
          try {
            fs.rmSync(distSubDir, {recursive: true, force: true})
            result.deletedFiles.push(distSubDir)
            logger?.debug({action: 'cleanStaleDistFiles', deleted: distSubDir})
          } catch (error) {
            result.errors.push({file: distSubDir, error: error as Error})
            logger?.warn({action: 'cleanStaleDistFiles', error: (error as Error).message, file: distSubDir})
          }
        }
      } else {
        // Recursively clean subdirectory
        const subResult = cleanStaleDistFiles(ctx, {
          srcDir: srcSubDir,
          distDir: distSubDir,
          extension,
          dryRun,
          logger,
        })
        result.deletedFiles.push(...subResult.deletedFiles)
        result.wouldDelete.push(...subResult.wouldDelete)
        result.errors.push(...subResult.errors)
      }
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      // For files, check if corresponding src file exists
      const distFilePath = nodePath.join(distDir, entry.name)

      // Try to find corresponding source file
      // Convention: dist/foo.md -> src/foo/skill.md or src/foo.cn.mdx
      const baseName = entry.name.replace(extension, '')
      const possibleSrcPaths = [
        nodePath.join(srcDir, baseName, 'skill.md'),
        nodePath.join(srcDir, `${baseName}.cn.mdx`),
        nodePath.join(srcDir, `${baseName}${extension}`),
        nodePath.join(srcDir, entry.name),
      ]

      const srcExists = possibleSrcPaths.some(p => fs.existsSync(p))

      if (!srcExists) {
        if (dryRun) {
          result.wouldDelete.push(distFilePath)
          logger?.debug({action: 'cleanStaleDistFiles', wouldDelete: distFilePath})
        } else {
          try {
            fs.unlinkSync(distFilePath)
            result.deletedFiles.push(distFilePath)
            logger?.debug({action: 'cleanStaleDistFiles', deleted: distFilePath})
          } catch (error) {
            result.errors.push({file: distFilePath, error: error as Error})
            logger?.warn({action: 'cleanStaleDistFiles', error: (error as Error).message, file: distFilePath})
          }
        }
      }
    }
  }

  return result
}

/**
 * Options for syncing directories.
 */
export interface SyncDirectoryOptions {
  /** Source directory */
  readonly srcDir: string
  /** Target directory */
  readonly targetDir: string
  /** File pattern to match (glob pattern) */
  readonly pattern?: string
  /** Whether to delete files in target that don't exist in source */
  readonly deleteOrphans?: boolean
  /** Whether to run in dry-run mode */
  readonly dryRun?: boolean
  /** Logger instance */
  readonly logger?: ILogger | undefined
}

/**
 * Result of directory sync operation.
 */
export interface SyncDirectoryResult {
  /** Files that were copied */
  readonly copiedFiles: string[]
  /** Files that were deleted (orphans) */
  readonly deletedFiles: string[]
  /** Errors encountered */
  readonly errors: {file: string, error: Error}[]
}

/**
 * Sync files from source directory to target directory.
 * Optionally removes orphaned files in target that don't exist in source.
 *
 * @param ctx - Effect context containing fs and path modules
 * @param options - Configuration options
 * @returns Result containing copied/deleted files and any errors
 */
export function syncDirectory(
  ctx: Pick<InputEffectContext, 'fs' | 'path' | 'logger'>,
  options: SyncDirectoryOptions,
): SyncDirectoryResult {
  const {srcDir, targetDir, deleteOrphans = false, dryRun = false, logger} = options
  const {fs, path: nodePath} = ctx

  const result: SyncDirectoryResult = {
    copiedFiles: [],
    deletedFiles: [],
    errors: [],
  }

  // Ensure target directory exists
  if (!dryRun && !fs.existsSync(targetDir)) fs.mkdirSync(targetDir, {recursive: true})

  // Check if source exists
  if (!fs.existsSync(srcDir)) {
    logger?.debug({action: 'syncDirectory', message: 'source directory does not exist', srcDir})
    return result
  }

  // Get source files
  const srcEntries = fs.readdirSync(srcDir, {withFileTypes: true})
  const srcNames = new Set(srcEntries.map(e => e.name))

  // Copy files from source to target
  for (const entry of srcEntries) {
    const srcPath = nodePath.join(srcDir, entry.name)
    const targetPath = nodePath.join(targetDir, entry.name)

    if (entry.isFile()) {
      if (!dryRun) {
        try {
          fs.copyFileSync(srcPath, targetPath)
          result.copiedFiles.push(targetPath)
          logger?.debug({action: 'syncDirectory', copied: targetPath})
        } catch (error) {
          result.errors.push({file: targetPath, error: error as Error})
        }
      }
      else result.copiedFiles.push(targetPath)
    } else if (entry.isDirectory()) {
      // Recursively sync subdirectories
      const subResult = syncDirectory(ctx, {
        srcDir: srcPath,
        targetDir: targetPath,
        deleteOrphans,
        dryRun,
        logger,
      })
      result.copiedFiles.push(...subResult.copiedFiles)
      result.deletedFiles.push(...subResult.deletedFiles)
      result.errors.push(...subResult.errors)
    }
  }

  // Delete orphaned files in target
  if (!(deleteOrphans && fs.existsSync(targetDir))) return result

  const targetEntries = fs.readdirSync(targetDir, {withFileTypes: true})
  for (const entry of targetEntries) {
    if (!srcNames.has(entry.name)) {
      const targetPath = nodePath.join(targetDir, entry.name)
      if (!dryRun) {
        try {
          if (entry.isDirectory()) fs.rmSync(targetPath, {recursive: true, force: true})
          else fs.unlinkSync(targetPath)
          result.deletedFiles.push(targetPath)
          logger?.debug({action: 'syncDirectory', deleted: targetPath})
        } catch (error) {
          result.errors.push({file: targetPath, error: error as Error})
        }
      }
      else result.deletedFiles.push(targetPath)
    }
  }
  return result
}

/**
 * Options for executing a shell command as an effect.
 */
export interface ExecuteCommandOptions {
  /** Effect context containing spawn function */
  readonly ctx: Pick<InputEffectContext, 'spawn' | 'logger'>
  /** Command to execute */
  readonly command: string
  /** Arguments for the command */
  readonly args?: readonly string[]
  /** Working directory */
  readonly cwd?: string
  /** Environment variables */
  readonly env?: Record<string, string>
  /** Timeout in milliseconds */
  readonly timeout?: number
  /** Whether to run in dry-run mode */
  readonly dryRun?: boolean
}

/**
 * Result of command execution.
 */
export interface ExecuteCommandResult {
  /** Whether the command succeeded (exit code 0) */
  readonly success: boolean
  /** Exit code */
  readonly exitCode: number | null
  /** Standard output */
  readonly stdout: string
  /** Standard error */
  readonly stderr: string
  /** Error if command failed to execute */
  readonly error?: Error
}

/**
 * Execute a shell command as an effect.
 * Useful for running build scripts, compilers, etc.
 *
 * @param options - Command execution options
 * @returns Result containing output and exit code
 *
 * @example
 * ```typescript
 * this.registerEffect('compile-skills', async (ctx) => {
 *   const result = await executeCommand({
 *     ctx,
 *     command: 'npx',
 *     args: ['tsc', '--project', 'tsconfig.skills.json'],
 *     cwd: ctx.shadowProjectDir,
 *   })
 *   return {
 *     success: result.success,
 *     description: result.success ? 'Compiled skills' : result.stderr,
 *   }
 * })
 * ```
 */
export async function executeCommand(options: ExecuteCommandOptions): Promise<ExecuteCommandResult> {
  const {ctx, command, args = [], cwd, env, timeout, dryRun = false} = options
  const {spawn: spawnFn, logger} = ctx

  if (dryRun) {
    logger?.debug({action: 'executeCommand', dryRun: true, command, args})
    return {
      success: true,
      exitCode: 0,
      stdout: '',
      stderr: '',
    }
  }

  return new Promise(resolve => {
    const proc = spawnFn(command, [...args], {
      cwd,
      env: {...process.env, ...env},
      shell: true,
      timeout,
    })

    let stdout = ''
    let stderr = ''

    proc.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    proc.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    proc.on('error', error => {
      logger?.error({action: 'executeCommand', error: error.message, command})
      resolve({
        success: false,
        exitCode: null,
        stdout,
        stderr,
        error,
      })
    })

    proc.on('close', code => {
      const success = code === 0
      if (success) logger?.debug({action: 'executeCommand', success: true, command})
      else logger?.warn({action: 'executeCommand', success: false, exitCode: code, command, stderr})
      resolve({
        success,
        exitCode: code,
        stdout,
        stderr,
      })
    })
  })
}
