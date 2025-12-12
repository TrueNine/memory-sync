/**
 * EditorconfigConfigPlugin - Config output plugin for .editorconfig files
 * Handles ConfigFile input type and emits .editorconfig to workspace root
 * Copies config files without transformation
 *
 * @see Requirements 34.3
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
 * Options for EditorconfigConfigPlugin
 */
export interface EditorconfigConfigPluginOptions {
  /**
   * Whether to emit files (can be disabled for testing)
   * Default: true
   */
  emitFiles?: boolean

  /**
   * Target filename for editorconfig
   * Default: .editorconfig
   */
  targetFilename?: string

  /**
   * Source filename pattern to match for editorconfig
   * Default: .editorconfig
   */
  sourcePattern?: string
}

/**
 * Default plugin outputs for EditorconfigConfigPlugin
 * Emits .editorconfig to workspace root
 *
 * @see Requirement 34.3
 */
const DEFAULT_OUTPUTS: PluginOutput[] = [
  {
    id: 'workspace-editorconfig',
    category: 'config',
    tool: 'editorconfig',
    targetType: 'workspace',
    path: '.editorconfig',
    enabled: true,
  },
]

/**
 * Input types handled by EditorconfigConfigPlugin
 * @see Requirement 34.3
 */
const HANDLED_INPUT_TYPES: InputType[] = [
  InputType.CONFIG_FILE,
]

/**
 * Check if an InputBundle is an editorconfig file
 * Matches paths ending with .editorconfig
 *
 * @param bundle - InputBundle to check
 * @param sourcePattern - Pattern to match (default: .editorconfig)
 * @returns True if bundle is an editorconfig file
 */
export function isEditorconfigBundle(
  bundle: InputBundle,
  sourcePattern: string = '.editorconfig',
  ctx: PluginContext,
): boolean {
  if (bundle.type !== InputType.CONFIG_FILE) {
    return false
  }

  const normalizedPath = bundle.path.replace(/\\/g, '/')
  const filename = ctx.path.basename(normalizedPath)
  return filename === sourcePattern
}

/**
 * Filter InputBundles to only include editorconfig files
 *
 * @param bundles - Array of InputBundles
 * @param ctx - Plugin context
 * @param sourcePattern - Pattern to match (default: .editorconfig)
 * @returns Filtered array containing only editorconfig files
 */
export function filterEditorconfigBundles(
  bundles: InputBundle[],
  ctx: PluginContext,
  sourcePattern: string = '.editorconfig',
): InputBundle[] {
  return bundles.filter((bundle) => isEditorconfigBundle(bundle, sourcePattern, ctx))
}

/**
 * Process a ConfigFile InputBundle for editorconfig
 * Copies the file without transformation
 *
 * @param bundle - InputBundle of type ConfigFile
 * @param ctx - Plugin context
 * @param targetFilename - Target filename (default: .editorconfig)
 * @returns EmittedFile ready for writing, or null if bundle is invalid
 * @see Requirement 34.3
 */
export function processConfigFileForEditorconfig(
  bundle: InputBundle,
  ctx: PluginContext,
  targetFilename: string = '.editorconfig',
): EmittedFile | null {
  // Skip directories (they have empty content)
  if (bundle.content === '') {
    ctx.log.debug(`EditorconfigConfigPlugin: Skipping empty bundle ${bundle.path}`)
    return null
  }

  ctx.log.debug(`EditorconfigConfigPlugin: Processing ${bundle.path}`)

  // Copy without transformation (Requirement 34.3)
  return {
    type: 'asset',
    fileName: targetFilename,
    source: bundle.content,
    targetType: 'workspace',
    inputType: InputType.CONFIG_FILE,
  }
}

/**
 * EditorconfigConfigPlugin - Config output plugin for .editorconfig files
 *
 * Handles ConfigFile input type for .editorconfig files.
 * Copies config files without transformation to preserve editor settings.
 *
 * @example
 * ```typescript
 * // Basic usage
 * const plugin = createEditorconfigConfigPlugin()
 *
 * // With custom options
 * const plugin = createEditorconfigConfigPlugin({
 *   targetFilename: '.editorconfig',
 *   emitFiles: true,
 * })
 * ```
 *
 * @see Requirements 34.3
 */
export function createEditorconfigConfigPlugin(
  options: EditorconfigConfigPluginOptions = {},
): OutputPlugin {
  const {
    emitFiles = true,
    targetFilename = '.editorconfig',
    sourcePattern = '.editorconfig',
  } = options

  // Track processed bundles for reporting
  let configBundles: InputBundle[] = []
  let emittedFiles: EmittedFile[] = []

  return {
    name: 'editorconfigConfig',
    priority: 200,

    // Handle ConfigFile input type (Requirement 34.3)
    inputTypes: HANDLED_INPUT_TYPES,

    // Output configuration (Requirement 34.3)
    outputs: DEFAULT_OUTPUTS,

    /**
     * Build start hook - initialize plugin state
     */
    buildStart(ctx: PluginContext, _params: BuildStartParams): void {
      configBundles = []
      emittedFiles = []
      ctx.log.debug('EditorconfigConfigPlugin: Starting build')
    },

    /**
     * Generate bundle hook - process ConfigFile bundles for editorconfig
     * Collects .editorconfig files and prepares them for emission
     *
     * @see Requirement 34.3
     */
    async generateBundle(ctx: PluginContext, _params: GenerateBundleParams): Promise<void> {
      // Get all ConfigFile bundles
      const allConfigBundles = ctx.getInputBundles(InputType.CONFIG_FILE)

      // Filter to only editorconfig files
      const editorconfigBundles = filterEditorconfigBundles(allConfigBundles, ctx, sourcePattern)

      if (editorconfigBundles.length === 0) {
        ctx.log.debug('EditorconfigConfigPlugin: No editorconfig files found')
        return
      }

      ctx.log.debug(`EditorconfigConfigPlugin: Processing ${editorconfigBundles.length} editorconfig bundle(s)`)

      // Process only the first editorconfig file found (there should only be one per workspace)
      for (const bundle of editorconfigBundles) {
        const emittedFile = processConfigFileForEditorconfig(bundle, ctx, targetFilename)

        if (emittedFile != null && emitFiles) {
          ctx.emitFile(emittedFile)
          emittedFiles.push(emittedFile)
        }

        configBundles.push(bundle)
      }

      // Store processed data in registry
      ctx.registry.set('editorconfigConfig', 'configBundles', configBundles)
      ctx.registry.set('editorconfigConfig', 'emittedFiles', emittedFiles)
      ctx.registry.set('editorconfigConfig', 'targetFilename', targetFilename)
    },

    /**
     * Write bundle hook - write .editorconfig to workspace root
     * Copies file without transformation
     *
     * @see Requirement 34.3
     */
    async writeBundle(ctx: PluginContext, params: WriteBundleParams): Promise<void> {
      if (!emitFiles) {
        ctx.log.debug('EditorconfigConfigPlugin: File emission disabled')
        return
      }

      const { files } = params

      // Filter to only our emitted files
      const editorconfigFiles = files.filter(
        (f) =>
          f.inputType === InputType.CONFIG_FILE
          && f.fileName === targetFilename,
      )

      if (editorconfigFiles.length === 0) {
        ctx.log.debug('EditorconfigConfigPlugin: No editorconfig files to write')
        return
      }

      let written = 0

      for (const file of editorconfigFiles) {
        try {
          // Resolve target path at workspace root
          const targetPath = ctx.paths.resolve(file.fileName)

          // Write the file (copy without transformation)
          await ctx.fs.writeFile(targetPath, file.source)
          written++

          ctx.log.debug(`EditorconfigConfigPlugin: Wrote ${targetPath}`)
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          ctx.log.error(`EditorconfigConfigPlugin: Failed to write ${file.fileName}: ${errorMsg}`)
        }
      }

      if (written > 0) {
        ctx.log.info(`EditorconfigConfigPlugin: Wrote ${written} .editorconfig file(s)`)
      }
    },
  }
}
