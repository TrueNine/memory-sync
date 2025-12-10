/**
 * JetBrainsIDEConfigPlugin - Config output plugin for JetBrains IDE settings
 * Handles ConfigFile input type and emits to .idea/ directory
 * Copies config files without transformation
 *
 * @see Requirements 34.1, 34.4
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
 * Options for JetBrainsIDEConfigPlugin
 */
export interface JetBrainsIDEConfigPluginOptions {
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
   * Target directory for JetBrains config files
   * Default: .idea/
   */
  targetDir?: string

  /**
   * Source directory pattern to match for JetBrains config
   * Default: .idea
   */
  sourcePattern?: string
}

/**
 * Default plugin outputs for JetBrainsIDEConfigPlugin
 * Emits to .idea/ directory
 *
 * @see Requirement 34.1
 */
const DEFAULT_OUTPUTS: PluginOutput[] = [
  {
    id: 'workspace-idea',
    category: 'config',
    tool: 'jetbrains',
    targetType: 'workspace',
    path: '.idea',
    enabled: true,
  },
]

/**
 * Input types handled by JetBrainsIDEConfigPlugin
 * @see Requirement 34.1
 */
const HANDLED_INPUT_TYPES: InputType[] = [
  InputType.CONFIG_FILE,
]

/**
 * Check if an InputBundle is a JetBrains config file
 * Matches paths containing .idea directory
 *
 * @param bundle - InputBundle to check
 * @param sourcePattern - Pattern to match (default: .idea)
 * @returns True if bundle is a JetBrains config file
 */
export function isJetBrainsConfigBundle(
  bundle: InputBundle,
  sourcePattern: string = '.idea',
): boolean {
  if (bundle.type !== InputType.CONFIG_FILE) {
    return false
  }

  const normalizedPath = bundle.path.replace(/\\/g, '/')
  return normalizedPath.includes(`/${sourcePattern}`) || normalizedPath.endsWith(sourcePattern)
}

/**
 * Filter InputBundles to only include JetBrains config files
 *
 * @param bundles - Array of InputBundles
 * @param sourcePattern - Pattern to match (default: .idea)
 * @returns Filtered array containing only JetBrains config files
 */
export function filterJetBrainsConfigBundles(
  bundles: InputBundle[],
  sourcePattern: string = '.idea',
): InputBundle[] {
  return bundles.filter((bundle) => isJetBrainsConfigBundle(bundle, sourcePattern))
}

/**
 * Process a ConfigFile InputBundle for JetBrains IDE
 * Copies the file without transformation
 *
 * @param bundle - InputBundle of type ConfigFile
 * @param ctx - Plugin context
 * @returns EmittedFile ready for writing, or null if bundle is a directory
 * @see Requirement 34.4
 */
export function processConfigFileForJetBrains(
  bundle: InputBundle,
  ctx: PluginContext,
): EmittedFile | null {
  // Skip directories (they have empty content)
  if (bundle.content === '') {
    ctx.log.debug(`JetBrainsIDEConfigPlugin: Skipping directory ${bundle.path}`)
    return null
  }

  // Extract relative path within .idea directory
  const normalizedPath = bundle.path.replace(/\\/g, '/')
  const ideaIndex = normalizedPath.lastIndexOf('.idea')

  if (ideaIndex === -1) {
    ctx.log.warn(`JetBrainsIDEConfigPlugin: Invalid path ${bundle.path}`)
    return null
  }

  // Get the relative path from .idea onwards
  const relativePath = normalizedPath.substring(ideaIndex)

  ctx.log.debug(`JetBrainsIDEConfigPlugin: Processing ${relativePath}`)

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
 * Copy a directory recursively for JetBrains config
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
        ctx.log.debug(`JetBrainsIDEConfigPlugin: Copied ${entry.name}`)
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    ctx.log.error(`JetBrainsIDEConfigPlugin: Failed to copy directory: ${errorMsg}`)
  }

  return filesCopied
}

/**
 * JetBrainsIDEConfigPlugin - Config output plugin for JetBrains IDE settings
 *
 * Handles ConfigFile input type for .idea/ directories.
 * Copies config files without transformation to preserve JetBrains settings.
 *
 * @example
 * ```typescript
 * // Basic usage
 * const plugin = createJetBrainsIDEConfigPlugin()
 *
 * // With custom options
 * const plugin = createJetBrainsIDEConfigPlugin({
 *   targetDir: '.idea/',
 *   cleanTarget: false,
 * })
 * ```
 *
 * @see Requirements 34.1, 34.4
 */
export function createJetBrainsIDEConfigPlugin(
  options: JetBrainsIDEConfigPluginOptions = {},
): OutputPlugin {
  const {
    cleanTarget = false,
    emitFiles = true,
    targetDir = '.idea',
    sourcePattern = '.idea',
  } = options

  // Track processed bundles for reporting
  let configBundles: InputBundle[] = []
  let emittedFiles: EmittedFile[] = []
  let directoryBundles: InputBundle[] = []

  return {
    name: 'jetBrainsIdeConfig',
    priority: 200,

    // Handle ConfigFile input type (Requirement 34.1)
    inputTypes: HANDLED_INPUT_TYPES,

    // Output configuration (Requirement 34.1)
    outputs: DEFAULT_OUTPUTS,

    /**
     * Build start hook - initialize plugin state
     */
    buildStart(ctx: PluginContext, _params: BuildStartParams): void {
      configBundles = []
      emittedFiles = []
      directoryBundles = []
      ctx.log.debug('JetBrainsIDEConfigPlugin: Starting build')
    },

    /**
     * Generate bundle hook - process ConfigFile bundles for JetBrains
     * Collects all .idea config files and prepares them for emission
     *
     * @see Requirements 34.1, 34.4
     */
    async generateBundle(ctx: PluginContext, _params: GenerateBundleParams): Promise<void> {
      // Get all ConfigFile bundles
      const allConfigBundles = ctx.getInputBundles(InputType.CONFIG_FILE)

      // Filter to only JetBrains config files
      const jetBrainsBundles = filterJetBrainsConfigBundles(allConfigBundles, sourcePattern)

      if (jetBrainsBundles.length === 0) {
        ctx.log.debug('JetBrainsIDEConfigPlugin: No JetBrains config files found')
        return
      }

      ctx.log.debug(`JetBrainsIDEConfigPlugin: Processing ${jetBrainsBundles.length} config bundle(s)`)

      for (const bundle of jetBrainsBundles) {
        // Check if this is a directory bundle (empty content)
        if (bundle.content === '') {
          directoryBundles.push(bundle)
          continue
        }

        // Process file bundles
        const emittedFile = processConfigFileForJetBrains(bundle, ctx)

        if (emittedFile != null && emitFiles) {
          ctx.emitFile(emittedFile)
          emittedFiles.push(emittedFile)
        }

        configBundles.push(bundle)
      }

      // Store processed data in registry
      ctx.registry.set('jetBrainsIdeConfig', 'configBundles', configBundles)
      ctx.registry.set('jetBrainsIdeConfig', 'directoryBundles', directoryBundles)
      ctx.registry.set('jetBrainsIdeConfig', 'emittedFiles', emittedFiles)
      ctx.registry.set('jetBrainsIdeConfig', 'targetDir', targetDir)
    },

    /**
     * Write bundle hook - write config files to .idea/
     * Copies files without transformation
     *
     * @see Requirements 34.1, 34.4
     */
    async writeBundle(ctx: PluginContext, params: WriteBundleParams): Promise<void> {
      if (!emitFiles) {
        ctx.log.debug('JetBrainsIDEConfigPlugin: File emission disabled')
        return
      }

      const { files } = params

      // Filter to only our emitted files
      const jetBrainsFiles = files.filter(
        (f) =>
          f.inputType === InputType.CONFIG_FILE
          && f.fileName.includes('.idea'),
      )

      // Resolve target directory
      const resolvedTargetDir = ctx.paths.resolve(targetDir)

      // Clean target directory if configured
      if (cleanTarget) {
        ctx.log.debug('JetBrainsIDEConfigPlugin: Cleaning target directory')
        try {
          await ctx.fs.cleanDir(resolvedTargetDir)
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          ctx.log.warn(`JetBrainsIDEConfigPlugin: Failed to clean target directory: ${errorMsg}`)
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

          ctx.log.debug(`JetBrainsIDEConfigPlugin: Copying directory ${sourcePath} to ${targetPath}`)
          const copied = await copyDirectoryRecursive(ctx, sourcePath, targetPath)
          written += copied
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          ctx.log.error(`JetBrainsIDEConfigPlugin: Failed to copy directory: ${errorMsg}`)
        }
      }

      // Handle individual file bundles
      for (const file of jetBrainsFiles) {
        try {
          // Extract relative path within .idea
          const relativePath = file.fileName.replace(/^\.idea[\\/]?/, '')
          const targetPath = ctx.path.join(resolvedTargetDir, relativePath)
          const targetFileDir = ctx.path.dirname(targetPath)

          // Ensure parent directory exists
          await ctx.fs.ensureDir(targetFileDir)

          // Write the file (copy without transformation)
          await ctx.fs.writeFile(targetPath, file.source)
          written++

          ctx.log.debug(`JetBrainsIDEConfigPlugin: Wrote ${targetPath}`)
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          ctx.log.error(`JetBrainsIDEConfigPlugin: Failed to write ${file.fileName}: ${errorMsg}`)
        }
      }

      if (written > 0) {
        ctx.log.info(`JetBrainsIDEConfigPlugin: Wrote ${written} file(s) to .idea/`)
      }
    },
  }
}

export default createJetBrainsIDEConfigPlugin
