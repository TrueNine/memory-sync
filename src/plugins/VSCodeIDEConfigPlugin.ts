/**
 * VSCodeIDEConfigPlugin - Config output plugin for VSCode IDE settings
 * Handles ConfigFile input type and emits to .vscode/ directory
 * Copies config files without transformation
 *
 * @see Requirements 34.2, 34.5
 * **Feature: plugin-architecture**
 */

import type {
  BuildStartParams,
  EmittedFile,
  GenerateBundleParams,
  InputBundle,
  OutputPlugin,
  PluginContext,
  PluginOutput,
  WriteBundleParams,
} from '../core/types'
import { InputType } from '../core/types'

/**
 * Options for VSCodeIDEConfigPlugin
 */
export interface VSCodeIDEConfigPluginOptions {
  /**
   * Whether to clean target directory before export
   * Default: false
   */
  cleanTarget?: boolean

  /**
   * Whether to emit files (can be disabled for testing)
   * Default: true
   */
  emitFiles?: boolean

  /**
   * Target directory for VSCode config files
   * Default: .vscode/
   */
  targetDir?: string

  /**
   * Source directory pattern to match for VSCode config
   * Default: .vscode
   */
  sourcePattern?: string
}

/**
 * Default plugin outputs for VSCodeIDEConfigPlugin
 * Emits to .vscode/ directory
 *
 * @see Requirement 34.2
 */
const DEFAULT_OUTPUTS: PluginOutput[] = [
  {
    id: 'workspace-vscode',
    category: 'config',
    tool: 'vscode',
    targetType: 'workspace',
    path: '.vscode',
    enabled: true,
  },
]

/**
 * Input types handled by VSCodeIDEConfigPlugin
 * @see Requirement 34.2
 */
const HANDLED_INPUT_TYPES: InputType[] = [
  InputType.CONFIG_FILE,
]

/**
 * Check if an InputBundle is a VSCode config file
 * Matches paths containing .vscode directory
 *
 * @param bundle - InputBundle to check
 * @param sourcePattern - Pattern to match (default: .vscode)
 * @returns True if bundle is a VSCode config file
 */
export function isVSCodeConfigBundle(
  bundle: InputBundle,
  sourcePattern: string = '.vscode',
): boolean {
  if (bundle.type !== InputType.CONFIG_FILE) {
    return false
  }

  const normalizedPath = bundle.path.replace(/\\/g, '/')
  return normalizedPath.includes(`/${sourcePattern}`) || normalizedPath.endsWith(sourcePattern)
}

/**
 * Filter InputBundles to only include VSCode config files
 *
 * @param bundles - Array of InputBundles
 * @param sourcePattern - Pattern to match (default: .vscode)
 * @returns Filtered array containing only VSCode config files
 */
export function filterVSCodeConfigBundles(
  bundles: InputBundle[],
  sourcePattern: string = '.vscode',
): InputBundle[] {
  return bundles.filter((bundle) => isVSCodeConfigBundle(bundle, sourcePattern))
}

/**
 * Process a ConfigFile InputBundle for VSCode IDE
 * Copies the file without transformation
 *
 * @param bundle - InputBundle of type ConfigFile
 * @param ctx - Plugin context
 * @returns EmittedFile ready for writing, or null if bundle is a directory
 * @see Requirement 34.4
 */
export function processConfigFileForVSCode(
  bundle: InputBundle,
  ctx: PluginContext,
): EmittedFile | null {
  // Skip directories (they have empty content)
  if (bundle.content === '') {
    ctx.log.debug(`VSCodeIDEConfigPlugin: Skipping directory ${bundle.path}`)
    return null
  }

  // Extract relative path within .vscode directory
  const normalizedPath = bundle.path.replace(/\\/g, '/')
  const vscodeIndex = normalizedPath.lastIndexOf('.vscode')

  if (vscodeIndex === -1) {
    ctx.log.warn(`VSCodeIDEConfigPlugin: Invalid path ${bundle.path}`)
    return null
  }

  // Get the relative path from .vscode onwards
  const relativePath = normalizedPath.substring(vscodeIndex)

  ctx.log.debug(`VSCodeIDEConfigPlugin: Processing ${relativePath}`)

  // Copy without transformation (Requirement 34.4)
  return {
    type: 'asset',
    fileName: relativePath,
    source: bundle.content,
    targetType: 'workspace',
    inputType: InputType.CONFIG_FILE,
  }
}

/**
 * Copy a directory recursively for VSCode config
 *
 * @param ctx - Plugin context
 * @param sourcePath - Source directory path
 * @param targetPath - Target directory path
 * @returns Number of files copied
 */
async function copyDirectoryRecursive(
  ctx: PluginContext,
  sourcePath: string,
  targetPath: string,
): Promise<number> {
  let filesCopied = 0

  try {
    const entries = await ctx.fs.readdir(sourcePath, { withFileTypes: true })

    for (const entry of entries) {
      if (typeof entry === 'string') {
        continue
      }
      const srcPath = ctx.path.join(sourcePath, entry.name)
      const destPath = ctx.path.join(targetPath, entry.name)

      if (entry.isDirectory()) {
        await ctx.fs.ensureDir(destPath)
        filesCopied += await copyDirectoryRecursive(ctx, srcPath, destPath)
      } else {
        await ctx.fs.copy(srcPath, destPath)
        filesCopied++
        ctx.log.debug(`VSCodeIDEConfigPlugin: Copied ${entry.name}`)
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    ctx.log.error(`VSCodeIDEConfigPlugin: Failed to copy directory: ${errorMsg}`)
  }

  return filesCopied
}

/**
 * VSCodeIDEConfigPlugin - Config output plugin for VSCode IDE settings
 *
 * Handles ConfigFile input type for .vscode/ directories.
 * Copies config files without transformation to preserve VSCode settings.
 *
 * @example
 * ```typescript
 * // Basic usage
 * const plugin = createVSCodeIDEConfigPlugin()
 *
 * // With custom options
 * const plugin = createVSCodeIDEConfigPlugin({
 *   targetDir: '.vscode/',
 *   cleanTarget: false,
 * })
 * ```
 *
 * @see Requirements 34.2, 34.5
 */
export function createVSCodeIDEConfigPlugin(
  options: VSCodeIDEConfigPluginOptions = {},
): OutputPlugin {
  const {
    cleanTarget = false,
    emitFiles = true,
    targetDir = '.vscode',
    sourcePattern = '.vscode',
  } = options

  // Track processed bundles for reporting
  let configBundles: InputBundle[] = []
  let emittedFiles: EmittedFile[] = []
  let directoryBundles: InputBundle[] = []

  return {
    name: 'vscodeIdeConfig',
    priority: 200,

    // Handle ConfigFile input type (Requirement 34.2)
    inputTypes: HANDLED_INPUT_TYPES,

    // Output configuration (Requirement 34.2)
    outputs: DEFAULT_OUTPUTS,

    /**
     * Build start hook - initialize plugin state
     */
    buildStart(ctx: PluginContext, _params: BuildStartParams): void {
      configBundles = []
      emittedFiles = []
      directoryBundles = []
      ctx.log.debug('VSCodeIDEConfigPlugin: Starting build')
    },

    /**
     * Generate bundle hook - process ConfigFile bundles for VSCode
     * Collects all .vscode config files and prepares them for emission
     *
     * @see Requirements 34.2, 34.4
     */
    async generateBundle(ctx: PluginContext, _params: GenerateBundleParams): Promise<void> {
      // Get all ConfigFile bundles
      const allConfigBundles = ctx.getInputBundles(InputType.CONFIG_FILE)

      // Filter to only VSCode config files
      const vscodeBundles = filterVSCodeConfigBundles(allConfigBundles, sourcePattern)

      if (vscodeBundles.length === 0) {
        ctx.log.debug('VSCodeIDEConfigPlugin: No VSCode config files found')
        return
      }

      ctx.log.debug(`VSCodeIDEConfigPlugin: Processing ${vscodeBundles.length} config bundle(s)`)

      for (const bundle of vscodeBundles) {
        // Check if this is a directory bundle (empty content)
        if (bundle.content === '') {
          directoryBundles.push(bundle)
          continue
        }

        // Process file bundles
        const emittedFile = processConfigFileForVSCode(bundle, ctx)

        if (emittedFile != null && emitFiles) {
          ctx.emitFile(emittedFile)
          emittedFiles.push(emittedFile)
        }

        configBundles.push(bundle)
      }

      // Store processed data in registry
      ctx.registry.set('vscodeIdeConfig', 'configBundles', configBundles)
      ctx.registry.set('vscodeIdeConfig', 'directoryBundles', directoryBundles)
      ctx.registry.set('vscodeIdeConfig', 'emittedFiles', emittedFiles)
      ctx.registry.set('vscodeIdeConfig', 'targetDir', targetDir)
    },

    /**
     * Write bundle hook - write config files to .vscode/
     * Copies files without transformation
     * Creates directory if needed (Requirement 34.5)
     *
     * @see Requirements 34.2, 34.5
     */
    async writeBundle(ctx: PluginContext, params: WriteBundleParams): Promise<void> {
      if (!emitFiles) {
        ctx.log.debug('VSCodeIDEConfigPlugin: File emission disabled')
        return
      }

      const { files } = params

      // Filter to only our emitted files
      const vscodeFiles = files.filter(
        (f) =>
          f.inputType === InputType.CONFIG_FILE
          && f.fileName.includes('.vscode'),
      )

      // Resolve target directory
      const resolvedTargetDir = ctx.paths.resolve(targetDir)

      // Clean target directory if configured
      if (cleanTarget) {
        ctx.log.debug('VSCodeIDEConfigPlugin: Cleaning target directory')
        try {
          await ctx.fs.cleanDir(resolvedTargetDir)
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          ctx.log.warn(`VSCodeIDEConfigPlugin: Failed to clean target directory: ${errorMsg}`)
        }
      }

      // Ensure target directory exists (Requirement 34.5 - create directory if needed)
      await ctx.fs.ensureDir(resolvedTargetDir)

      let written = 0

      // Handle directory bundles - copy entire directories
      for (const dirBundle of directoryBundles) {
        try {
          const sourcePath = dirBundle.path
          const targetPath = resolvedTargetDir

          ctx.log.debug(`VSCodeIDEConfigPlugin: Copying directory ${sourcePath} to ${targetPath}`)
          const copied = await copyDirectoryRecursive(ctx, sourcePath, targetPath)
          written += copied
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          ctx.log.error(`VSCodeIDEConfigPlugin: Failed to copy directory: ${errorMsg}`)
        }
      }

      // Handle individual file bundles
      for (const file of vscodeFiles) {
        try {
          // Extract relative path within .vscode
          const relativePath = file.fileName.replace(/^\.vscode[\\/]?/, '')
          const targetPath = ctx.path.join(resolvedTargetDir, relativePath)
          const targetFileDir = ctx.path.dirname(targetPath)

          // Ensure parent directory exists
          await ctx.fs.ensureDir(targetFileDir)

          // Write the file (copy without transformation)
          await ctx.fs.writeFile(targetPath, file.source)
          written++

          ctx.log.debug(`VSCodeIDEConfigPlugin: Wrote ${targetPath}`)
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          ctx.log.error(`VSCodeIDEConfigPlugin: Failed to write ${file.fileName}: ${errorMsg}`)
        }
      }

      if (written > 0) {
        ctx.log.info(`VSCodeIDEConfigPlugin: Wrote ${written} file(s) to .vscode/`)
      }
    },
  }
}

export default createVSCodeIDEConfigPlugin
