/**
 * QoderIDEPlugin - IDE output plugin for Qoder rules files
 * Handles MemoryPrompt input type
 * Emits to .qoder/rules/ with glob front matter
 *
 * @see Requirements 33.3
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
} from '@/core/types'
import {
  addFrontMatterToContent,
  generateFrontMatterByType,
} from '@/core/capabilities/frontMatter'

import { FrontMatterType, InputType } from '@/core/types'

/**
 * Options for QoderIDEPlugin
 */
export interface QoderIDEPluginOptions {
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
   * Target directory for rules files
   * Default: .qoder/rules/
   */
  targetDir?: string
}

/**
 * Default plugin outputs for QoderIDEPlugin
 * Emits to .qoder/rules/ directory
 *
 * @see Requirement 33.3
 */
const DEFAULT_OUTPUTS: PluginOutput[] = [
  {
    id: 'workspace-rules',
    category: 'ide',
    tool: 'qoder',
    targetType: 'workspace',
    path: '.qoder/rules',
    enabled: true,
  },
]

/**
 * Input types handled by QoderIDEPlugin
 * @see Requirement 33.3
 */
const HANDLED_INPUT_TYPES: InputType[] = [
  InputType.MEMORY_PROMPT,
]

/**
 * Generate glob pattern from InputBundle path for Qoder
 * Creates a glob pattern for Qoder's glob trigger mode
 *
 * @param bundle - InputBundle containing the file path
 * @param ctx - Plugin context for path utilities
 * @returns Glob pattern for file matching
 */
export function generateQoderGlobPattern(bundle: InputBundle, ctx: PluginContext): string {
  const dir = ctx.path.dirname(bundle.path)
  const normalizedDir = dir.replace(/\\/g, '/')

  if (normalizedDir === '.' || normalizedDir === '') {
    return '**/*'
  }

  return `**/${normalizedDir}/**`
}

/**
 * Generate output filename for Qoder rules file
 * Converts the bundle path to a flat filename with .mdc extension
 *
 * @param bundle - InputBundle containing the file path
 * @param ctx - Plugin context for path utilities
 * @returns Output filename for the rules file
 */
export function generateQoderOutputFilename(bundle: InputBundle, ctx: PluginContext): string {
  const dir = ctx.path.dirname(bundle.path)
  const normalizedDir = dir.replace(/[\\/]/g, '_').replace(/^_+|_+$/g, '')

  if (normalizedDir === '' || normalizedDir === '.') {
    return '_root.mdc'
  }

  return `${normalizedDir}.mdc`
}

/**
 * Process a MemoryPrompt InputBundle for Qoder rules
 * Adds glob front matter based on the source directory
 *
 * @param bundle - InputBundle of type MemoryPrompt
 * @param ctx - Plugin context for capabilities
 * @returns EmittedFile ready for writing
 */
export function processMemoryPromptForQoder(
  bundle: InputBundle,
  ctx: PluginContext,
): EmittedFile {
  const pattern = generateQoderGlobPattern(bundle, ctx)
  const outputFilename = generateQoderOutputFilename(bundle, ctx)

  // Add glob front matter to content
  const transformedContent = addFrontMatterToContent(
    bundle.content,
    FrontMatterType.QODER_GLOB,
    pattern,
  )

  const frontMatter = generateFrontMatterByType(FrontMatterType.QODER_GLOB, { type: FrontMatterType.QODER_GLOB, filePattern: pattern })

  ctx.log.debug(`QoderIDEPlugin: Generated pattern "${pattern}" for ${bundle.path}`)

  return {
    type: 'asset',
    fileName: outputFilename,
    source: transformedContent,
    targetType: 'workspace',
    inputType: InputType.MEMORY_PROMPT,
    frontMatter,
  }
}

/**
 * Filter InputBundles to only include handled types
 *
 * @param bundles - Array of InputBundles
 * @returns Filtered array containing only handled input types
 */
export function filterQoderHandledBundles(bundles: InputBundle[]): InputBundle[] {
  return bundles.filter((bundle) => HANDLED_INPUT_TYPES.includes(bundle.type))
}

/**
 * QoderIDEPlugin - IDE output plugin for Qoder rules files
 *
 * Handles MemoryPrompt input type.
 * Emits files to .qoder/rules/ directory with glob front matter:
 * - MemoryPrompt: glob front matter with pattern based on source directory
 *
 * @example
 * ```typescript
 * // Basic usage
 * const plugin = createQoderIDEPlugin()
 *
 * // With custom options
 * const plugin = createQoderIDEPlugin({
 *   targetDir: '.qoder/rules/',
 *   cleanTarget: false,
 * })
 * ```
 *
 * @see Requirements 33.3
 */
export function createQoderIDEPlugin(options: QoderIDEPluginOptions = {}): OutputPlugin {
  const {
    cleanTarget = false,
    emitFiles = true,
    targetDir = '.qoder/rules',
  } = options

  // Track processed bundles for reporting
  let memoryPromptBundles: InputBundle[] = []
  let emittedFiles: EmittedFile[] = []

  return {
    name: 'qoderIde',
    priority: 100,

    // Handle MemoryPrompt input type (Requirement 33.3)
    inputTypes: HANDLED_INPUT_TYPES,

    // Output configuration (Requirement 33.3)
    outputs: DEFAULT_OUTPUTS,

    /**
     * Build start hook - initialize plugin state
     */
    buildStart(ctx: PluginContext, _params: BuildStartParams): void {
      memoryPromptBundles = []
      emittedFiles = []
      ctx.log.debug('QoderIDEPlugin: Starting build')
    },

    /**
     * Generate bundle hook - process MemoryPrompt bundles
     * Collects all input bundles and prepares them for emission with Qoder front matter
     *
     * @see Requirements 33.3
     */
    async generateBundle(ctx: PluginContext, _params: GenerateBundleParams): Promise<void> {
      // Process MemoryPrompt bundles
      const memoryBundles = ctx.getInputBundles(InputType.MEMORY_PROMPT)

      if (memoryBundles.length > 0) {
        ctx.log.debug(`QoderIDEPlugin: Processing ${memoryBundles.length} MemoryPrompt bundle(s)`)

        for (const bundle of memoryBundles) {
          const emittedFile = processMemoryPromptForQoder(bundle, ctx)

          if (emitFiles) {
            ctx.emitFile(emittedFile)
            emittedFiles.push(emittedFile)
          }

          memoryPromptBundles.push(bundle)
        }
      }

      // Store processed data in registry for potential child plugins
      ctx.registry.set('qoderIde', 'memoryPromptBundles', memoryPromptBundles)
      ctx.registry.set('qoderIde', 'emittedFiles', emittedFiles)
      ctx.registry.set('qoderIde', 'targetDir', targetDir)
    },

    /**
     * Write bundle hook - write rules files to .qoder/rules/
     *
     * @see Requirement 33.3
     */
    async writeBundle(ctx: PluginContext, params: WriteBundleParams): Promise<void> {
      if (!emitFiles) {
        ctx.log.debug('QoderIDEPlugin: File emission disabled')
        return
      }

      const { files } = params

      // Filter to only our emitted files
      const qoderFiles = files.filter(
        (f) => f.inputType === InputType.MEMORY_PROMPT && f.fileName.endsWith('.mdc'),
      )

      if (qoderFiles.length === 0) {
        ctx.log.debug('QoderIDEPlugin: No files to write')
        return
      }

      // Resolve target directory
      const resolvedTargetDir = ctx.paths.resolve(targetDir)

      // Clean target directory if configured
      if (cleanTarget) {
        ctx.log.debug('QoderIDEPlugin: Cleaning target directory')
        try {
          await ctx.fs.cleanDir(resolvedTargetDir)
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          ctx.log.warn(`QoderIDEPlugin: Failed to clean target directory: ${errorMsg}`)
        }
      }

      // Ensure target directory exists
      await ctx.fs.ensureDir(resolvedTargetDir)

      let written = 0

      for (const file of qoderFiles) {
        try {
          const targetPath = ctx.path.join(resolvedTargetDir, file.fileName)
          const targetFileDir = ctx.path.dirname(targetPath)

          // Ensure parent directory exists
          await ctx.fs.ensureDir(targetFileDir)

          // Write the file
          await ctx.fs.writeFile(targetPath, file.source)
          written++

          ctx.log.debug(`QoderIDEPlugin: Wrote ${targetPath}`)
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          ctx.log.error(`QoderIDEPlugin: Failed to write ${file.fileName}: ${errorMsg}`)
        }
      }

      if (written > 0) {
        ctx.log.info(`QoderIDEPlugin: Wrote ${written} file(s) to Qoder rules`)
      }
    },
  }
}
