/**
 * CursorIDEPlugin - IDE output plugin for Cursor rules files
 * Handles MemoryPrompt input type
 * Transforms filenames from *.md to *.mdc
 * Emits to .cursor/rules/
 *
 * @see Requirements 33.6, 14.1
 * **Feature: plugin-architecture**
 */

import type {
  BuildStartParams,
  EmittedFile,
  FilenameTransformRule,
  GenerateBundleParams,
  InputBundle,
  OutputPlugin,
  PluginContext,
  PluginOutput,
  WriteBundleParams,
} from '@/core/types'
import { InputType } from '@/core/types'

/**
 * Options for CursorIDEPlugin
 */
export interface CursorIDEPluginOptions {
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
   * Default: .cursor/rules/
   */
  targetDir?: string
}

/**
 * Default plugin outputs for CursorIDEPlugin
 * Emits to .cursor/rules/ directory
 *
 * @see Requirement 33.6
 */
const DEFAULT_OUTPUTS: PluginOutput[] = [
  {
    id: 'workspace-rules',
    category: 'ide',
    tool: 'cursor',
    targetType: 'workspace',
    path: '.cursor/rules',
    enabled: true,
  },
]

/**
 * Input types handled by CursorIDEPlugin
 * @see Requirement 33.6
 */
const HANDLED_INPUT_TYPES: InputType[] = [
  InputType.MEMORY_PROMPT,
]

/**
 * Default filename transformation rules for CursorIDEPlugin
 * Transforms *.md to *.mdc
 *
 * @see Requirements 33.6, 14.1
 */
const DEFAULT_FILENAME_TRANSFORM: FilenameTransformRule[] = [
  {
    pattern: /\.md$/,
    replacement: '.mdc',
    tools: ['cursor'],
  },
]

/**
 * Transform filename from *.md to *.mdc
 * Applies the Cursor-specific filename transformation
 *
 * @param filename - Original filename
 * @returns Transformed filename with .mdc extension
 * @see Requirements 33.6, 14.1
 */
export function transformCursorFilename(filename: string): string {
  return filename.replace(/\.md$/, '.mdc')
}

/**
 * Generate output filename for Cursor rules file
 * Converts the bundle path to a flat filename with .mdc extension
 *
 * @param bundle - InputBundle containing the file path
 * @param ctx - Plugin context for path utilities
 * @returns Output filename for the rules file
 */
export function generateCursorOutputFilename(bundle: InputBundle, ctx: PluginContext): string {
  const dir = ctx.path.dirname(bundle.path)
  const normalizedDir = dir.replace(/[\\/]/g, '_').replace(/^_+|_+$/g, '')

  if (normalizedDir === '' || normalizedDir === '.') {
    return '_root.mdc'
  }

  return `${normalizedDir}.mdc`
}

/**
 * Process a MemoryPrompt InputBundle for Cursor rules
 * Creates an EmittedFile with .mdc extension
 *
 * @param bundle - InputBundle of type MemoryPrompt
 * @param ctx - Plugin context for capabilities
 * @returns EmittedFile ready for writing
 */
export function processMemoryPromptForCursor(
  bundle: InputBundle,
  ctx: PluginContext,
): EmittedFile {
  const outputFilename = generateCursorOutputFilename(bundle, ctx)

  ctx.log.debug(`CursorIDEPlugin: Processing MemoryPrompt ${bundle.path} -> ${outputFilename}`)

  const emittedFile: EmittedFile = {
    type: 'asset',
    fileName: outputFilename,
    source: bundle.content,
    targetType: 'workspace',
    inputType: InputType.MEMORY_PROMPT,
  }

  if (bundle.frontMatter) {
    emittedFile.frontMatter = bundle.frontMatter
  }

  return emittedFile
}

/**
 * Filter InputBundles to only include handled types
 *
 * @param bundles - Array of InputBundles
 * @returns Filtered array containing only handled input types
 */
export function filterCursorHandledBundles(bundles: InputBundle[]): InputBundle[] {
  return bundles.filter((bundle) => HANDLED_INPUT_TYPES.includes(bundle.type))
}

/**
 * CursorIDEPlugin - IDE output plugin for Cursor rules files
 *
 * Handles MemoryPrompt input type.
 * Emits files to .cursor/rules/ directory with .mdc extension.
 * Transforms filenames from *.md to *.mdc.
 *
 * @example
 * ```typescript
 * // Basic usage
 * const plugin = createCursorIDEPlugin()
 *
 * // With custom options
 * const plugin = createCursorIDEPlugin({
 *   targetDir: '.cursor/rules/',
 *   cleanTarget: false,
 * })
 * ```
 *
 * @see Requirements 33.6, 14.1
 */
export function createCursorIDEPlugin(options: CursorIDEPluginOptions = {}): OutputPlugin {
  const {
    cleanTarget = false,
    emitFiles = true,
    targetDir = '.cursor/rules',
  } = options

  // Track processed bundles for reporting
  let memoryPromptBundles: InputBundle[] = []
  let emittedFiles: EmittedFile[] = []

  return {
    name: 'cursorIde',
    priority: 100,

    // Handle MemoryPrompt input type (Requirement 33.6)
    inputTypes: HANDLED_INPUT_TYPES,

    // Output configuration (Requirement 33.6)
    outputs: DEFAULT_OUTPUTS,

    // Filename transformation rules (Requirements 33.6, 14.1)
    filenameTransform: DEFAULT_FILENAME_TRANSFORM,

    /**
     * Build start hook - initialize plugin state
     */
    buildStart(ctx: PluginContext, _params: BuildStartParams): void {
      memoryPromptBundles = []
      emittedFiles = []
      ctx.log.debug('CursorIDEPlugin: Starting build')
    },

    /**
     * Transform filename hook - convert *.md to *.mdc
     * @see Requirements 33.6, 14.1
     */
    transformFilename(filename: string, _ctx: PluginContext): string | null {
      if (filename.endsWith('.md')) {
        return transformCursorFilename(filename)
      }
      return null
    },

    /**
     * Generate bundle hook - process MemoryPrompt bundles
     * Collects all input bundles and prepares them for emission
     *
     * @see Requirements 33.6
     */
    async generateBundle(ctx: PluginContext, _params: GenerateBundleParams): Promise<void> {
      // Process MemoryPrompt bundles
      const memoryBundles = ctx.getInputBundles(InputType.MEMORY_PROMPT)

      if (memoryBundles.length > 0) {
        ctx.log.debug(`CursorIDEPlugin: Processing ${memoryBundles.length} MemoryPrompt bundle(s)`)

        for (const bundle of memoryBundles) {
          const emittedFile = processMemoryPromptForCursor(bundle, ctx)

          if (emitFiles) {
            ctx.emitFile(emittedFile)
            emittedFiles.push(emittedFile)
          }

          memoryPromptBundles.push(bundle)
        }
      }

      // Store processed data in registry for potential child plugins (e.g., CodeBuddyIDEPlugin)
      ctx.registry.set('cursorIde', 'memoryPromptBundles', memoryPromptBundles)
      ctx.registry.set('cursorIde', 'emittedFiles', emittedFiles)
      ctx.registry.set('cursorIde', 'targetDir', targetDir)
    },

    /**
     * Write bundle hook - write rules files to .cursor/rules/
     *
     * @see Requirement 33.6
     */
    async writeBundle(ctx: PluginContext, params: WriteBundleParams): Promise<void> {
      if (!emitFiles) {
        ctx.log.debug('CursorIDEPlugin: File emission disabled')
        return
      }

      const { files } = params

      // Filter to only our emitted files
      const cursorFiles = files.filter(
        (f) => f.inputType === InputType.MEMORY_PROMPT && f.fileName.endsWith('.mdc'),
      )

      if (cursorFiles.length === 0) {
        ctx.log.debug('CursorIDEPlugin: No files to write')
        return
      }

      // Resolve target directory
      const resolvedTargetDir = ctx.paths.resolve(targetDir)

      // Clean target directory if configured
      if (cleanTarget) {
        ctx.log.debug('CursorIDEPlugin: Cleaning target directory')
        try {
          await ctx.fs.cleanDir(resolvedTargetDir)
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          ctx.log.warn(`CursorIDEPlugin: Failed to clean target directory: ${errorMsg}`)
        }
      }

      // Ensure target directory exists
      await ctx.fs.ensureDir(resolvedTargetDir)

      let written = 0

      for (const file of cursorFiles) {
        try {
          const targetPath = ctx.path.join(resolvedTargetDir, file.fileName)
          const targetFileDir = ctx.path.dirname(targetPath)

          // Ensure parent directory exists
          await ctx.fs.ensureDir(targetFileDir)

          // Write the file
          await ctx.fs.writeFile(targetPath, file.source)
          written++

          ctx.log.debug(`CursorIDEPlugin: Wrote ${targetPath}`)
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          ctx.log.error(`CursorIDEPlugin: Failed to write ${file.fileName}: ${errorMsg}`)
        }
      }

      if (written > 0) {
        ctx.log.info(`CursorIDEPlugin: Wrote ${written} file(s) to Cursor rules`)
      }
    },
  }
}
