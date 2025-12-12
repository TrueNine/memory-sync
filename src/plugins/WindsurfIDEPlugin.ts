/**
 * WindsurfIDEPlugin - IDE output plugin for Windsurf workflow files
 * Handles FastCommand input type
 * Emits to .windsurf/workflows/ with auto_execution_mode front matter
 *
 * @see Requirements 33.4
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
import {
  addFrontMatterToContent,
} from '../core/capabilities/frontMatter'

import { FrontMatterType, InputType } from '../core/types'

/**
 * Options for WindsurfIDEPlugin
 */
export interface WindsurfIDEPluginOptions {
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
   * Target directory for workflow files
   * Default: .windsurf/workflows/
   */
  targetDir?: string

  /**
   * Value for auto_execution_mode front matter
   * Default: 3
   */
  autoExecutionMode?: number
}

/**
 * Default plugin outputs for WindsurfIDEPlugin
 * Emits to .windsurf/workflows/ directory
 *
 * @see Requirement 33.4
 */
const DEFAULT_OUTPUTS: PluginOutput[] = [
  {
    id: 'workspace-workflows',
    category: 'ide',
    tool: 'windsurf',
    targetType: 'workspace',
    path: '.windsurf/workflows',
    enabled: true,
  },
]

/**
 * Input types handled by WindsurfIDEPlugin
 * @see Requirement 33.4
 */
const HANDLED_INPUT_TYPES: InputType[] = [
  InputType.FAST_COMMAND,
]

/**
 * Generate output filename for Windsurf workflow file
 * Preserves the original filename from the bundle path
 *
 * @param bundle - InputBundle containing the file path
 * @param ctx - Plugin context for path utilities
 * @returns Output filename for the workflow file
 */
export function generateWindsurfOutputFilename(bundle: InputBundle, ctx: PluginContext): string {
  return ctx.path.basename(bundle.path)
}

/**
 * Generate workflow front matter with auto_execution_mode
 * Creates front matter object for Windsurf workflow files
 *
 * @param autoExecutionMode - Value for auto_execution_mode (default: 3)
 * @returns Front matter object with auto_execution_mode
 */
export function generateWorkflowFrontMatter(
  autoExecutionMode: number = 3,
): Record<string, unknown> {
  return {
    auto_execution_mode: autoExecutionMode,
  }
}

/**
 * Process a FastCommand InputBundle for Windsurf workflow
 * Adds auto_execution_mode front matter to the content
 *
 * @param bundle - InputBundle of type FastCommand
 * @param ctx - Plugin context for capabilities
 * @param autoExecutionMode - Value for auto_execution_mode (default: 3)
 * @returns EmittedFile ready for writing
 */
export function processFastCommandForWindsurf(
  bundle: InputBundle,
  ctx: PluginContext,
  autoExecutionMode: number = 3,
): EmittedFile {
  const outputFilename = generateWindsurfOutputFilename(bundle, ctx)

  // Add workflow front matter to content
  const transformedContent = addFrontMatterToContent(
    bundle.content,
    FrontMatterType.WORKFLOW_AUTO,
    '',
    { auto_execution_mode: autoExecutionMode },
  )

  const frontMatter = generateWorkflowFrontMatter(autoExecutionMode)

  ctx.log.debug(`WindsurfIDEPlugin: Processing FastCommand ${bundle.path}`)

  return {
    type: 'asset',
    fileName: outputFilename,
    source: transformedContent,
    targetType: 'workspace',
    inputType: InputType.FAST_COMMAND,
    frontMatter,
  }
}

/**
 * Filter InputBundles to only include handled types
 *
 * @param bundles - Array of InputBundles
 * @returns Filtered array containing only handled input types
 */
export function filterWindsurfHandledBundles(bundles: InputBundle[]): InputBundle[] {
  return bundles.filter((bundle) => HANDLED_INPUT_TYPES.includes(bundle.type))
}

/**
 * WindsurfIDEPlugin - IDE output plugin for Windsurf workflow files
 *
 * Handles FastCommand input type.
 * Emits files to .windsurf/workflows/ directory with auto_execution_mode front matter.
 *
 * @example
 * ```typescript
 * // Basic usage
 * const plugin = createWindsurfIDEPlugin()
 *
 * // With custom options
 * const plugin = createWindsurfIDEPlugin({
 *   targetDir: '.windsurf/workflows/',
 *   autoExecutionMode: 3,
 *   cleanTarget: false,
 * })
 * ```
 *
 * @see Requirements 33.4
 */
export function createWindsurfIDEPlugin(options: WindsurfIDEPluginOptions = {}): OutputPlugin {
  const {
    cleanTarget = false,
    emitFiles = true,
    targetDir = '.windsurf/workflows',
    autoExecutionMode = 3,
  } = options

  // Track processed bundles for reporting
  let fastCommandBundles: InputBundle[] = []
  let emittedFiles: EmittedFile[] = []

  return {
    name: 'windsurfIde',
    priority: 100,

    // Handle FastCommand input type (Requirement 33.4)
    inputTypes: HANDLED_INPUT_TYPES,

    // Output configuration (Requirement 33.4)
    outputs: DEFAULT_OUTPUTS,

    /**
     * Build start hook - initialize plugin state
     */
    buildStart(ctx: PluginContext, _params: BuildStartParams): void {
      fastCommandBundles = []
      emittedFiles = []
      ctx.log.debug('WindsurfIDEPlugin: Starting build')
    },

    /**
     * Generate bundle hook - process FastCommand bundles
     * Collects all input bundles and prepares them for emission with workflow front matter
     *
     * @see Requirements 33.4
     */
    async generateBundle(ctx: PluginContext, _params: GenerateBundleParams): Promise<void> {
      // Process FastCommand bundles
      const commandBundles = ctx.getInputBundles(InputType.FAST_COMMAND)

      if (commandBundles.length > 0) {
        ctx.log.debug(`WindsurfIDEPlugin: Processing ${commandBundles.length} FastCommand bundle(s)`)

        for (const bundle of commandBundles) {
          const emittedFile = processFastCommandForWindsurf(bundle, ctx, autoExecutionMode)

          if (emitFiles) {
            ctx.emitFile(emittedFile)
            emittedFiles.push(emittedFile)
          }

          fastCommandBundles.push(bundle)
        }
      }

      // Store processed data in registry for potential child plugins (e.g., AntigravityIDEPlugin)
      ctx.registry.set('windsurfIde', 'fastCommandBundles', fastCommandBundles)
      ctx.registry.set('windsurfIde', 'emittedFiles', emittedFiles)
      ctx.registry.set('windsurfIde', 'targetDir', targetDir)
      ctx.registry.set('windsurfIde', 'autoExecutionMode', autoExecutionMode)
    },

    /**
     * Write bundle hook - write workflow files to .windsurf/workflows/
     *
     * @see Requirement 33.4
     */
    async writeBundle(ctx: PluginContext, params: WriteBundleParams): Promise<void> {
      if (!emitFiles) {
        ctx.log.debug('WindsurfIDEPlugin: File emission disabled')
        return
      }

      const { files } = params

      // Filter to only our emitted files
      const windsurfFiles = files.filter(
        (f) => f.inputType === InputType.FAST_COMMAND,
      )

      if (windsurfFiles.length === 0) {
        ctx.log.debug('WindsurfIDEPlugin: No files to write')
        return
      }

      // Resolve target directory
      const resolvedTargetDir = ctx.paths.resolve(targetDir)

      // Clean target directory if configured
      if (cleanTarget) {
        ctx.log.debug('WindsurfIDEPlugin: Cleaning target directory')
        try {
          await ctx.fs.cleanDir(resolvedTargetDir)
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          ctx.log.warn(`WindsurfIDEPlugin: Failed to clean target directory: ${errorMsg}`)
        }
      }

      // Ensure target directory exists
      await ctx.fs.ensureDir(resolvedTargetDir)

      let written = 0

      for (const file of windsurfFiles) {
        try {
          const targetPath = ctx.path.join(resolvedTargetDir, file.fileName)
          const targetFileDir = ctx.path.dirname(targetPath)

          // Ensure parent directory exists
          await ctx.fs.ensureDir(targetFileDir)

          // Write the file
          await ctx.fs.writeFile(targetPath, file.source)
          written++

          ctx.log.debug(`WindsurfIDEPlugin: Wrote ${targetPath}`)
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          ctx.log.error(`WindsurfIDEPlugin: Failed to write ${file.fileName}: ${errorMsg}`)
        }
      }

      if (written > 0) {
        ctx.log.info(`WindsurfIDEPlugin: Wrote ${written} file(s) to Windsurf workflows`)
      }
    },
  }
}
