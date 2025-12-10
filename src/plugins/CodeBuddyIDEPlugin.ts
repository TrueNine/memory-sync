/**
 * CodeBuddyIDEPlugin - IDE output plugin for CodeBuddy AI assistant
 * Extends CursorIDEPlugin with different output paths (.codebuddy/.rules/)
 * CodeBuddy uses same .mdc format as Cursor
 *
 * @see Requirements 33.7
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
} from '../core/types'
import { InputType } from '../core/types'
import {
  filterCursorHandledBundles,
  generateCursorOutputFilename,
  transformCursorFilename,
} from './CursorIDEPlugin'

/**
 * Options for CodeBuddyIDEPlugin
 */
export interface CodeBuddyIDEPluginOptions {
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
   * Default: .codebuddy/.rules/
   */
  targetDir?: string
}

/**
 * Default plugin outputs for CodeBuddyIDEPlugin
 * Emits to .codebuddy/.rules/ directory
 *
 * @see Requirement 33.7
 */
const DEFAULT_OUTPUTS: PluginOutput[] = [
  {
    id: 'workspace-rules',
    category: 'ide',
    tool: 'codebuddy',
    targetType: 'workspace',
    path: '.codebuddy/.rules',
    enabled: true,
  },
]

/**
 * Input types handled by CodeBuddyIDEPlugin
 * Same as CursorIDEPlugin - handles MemoryPrompt
 * @see Requirement 33.7
 */
const HANDLED_INPUT_TYPES: InputType[] = [
  InputType.MEMORY_PROMPT,
]

/**
 * Default filename transformation rules for CodeBuddyIDEPlugin
 * Transforms *.md to *.mdc (same as Cursor)
 *
 * @see Requirements 33.7, 14.1
 */
const DEFAULT_FILENAME_TRANSFORM: FilenameTransformRule[] = [
  {
    pattern: /\.md$/,
    replacement: '.mdc',
    tools: ['codebuddy'],
  },
]

/**
 * Generate output filename for CodeBuddy rules file
 * Uses the same logic as CursorIDEPlugin
 *
 * @param bundle - InputBundle containing the file path
 * @param ctx - Plugin context for path utilities
 * @returns Output filename for the rules file
 */
export function generateCodeBuddyOutputFilename(bundle: InputBundle, ctx: PluginContext): string {
  return generateCursorOutputFilename(bundle, ctx)
}

/**
 * Process a MemoryPrompt InputBundle for CodeBuddy rules
 * Creates an EmittedFile with .mdc extension
 *
 * @param bundle - InputBundle of type MemoryPrompt
 * @param ctx - Plugin context for capabilities
 * @returns EmittedFile ready for writing
 */
export function processMemoryPromptForCodeBuddy(
  bundle: InputBundle,
  ctx: PluginContext,
): EmittedFile {
  const outputFilename = generateCodeBuddyOutputFilename(bundle, ctx)

  ctx.log.debug(`CodeBuddyIDEPlugin: Processing MemoryPrompt ${bundle.path} -> ${outputFilename}`)

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
export function filterCodeBuddyHandledBundles(bundles: InputBundle[]): InputBundle[] {
  return bundles.filter((bundle) => HANDLED_INPUT_TYPES.includes(bundle.type))
}

/**
 * CodeBuddyIDEPlugin - IDE output plugin for CodeBuddy AI assistant
 *
 * Extends CursorIDEPlugin functionality with different output paths (.codebuddy/.rules/).
 * Handles MemoryPrompt input type.
 * Emits files to .codebuddy/.rules/ directory with .mdc extension.
 * Transforms filenames from *.md to *.mdc (same as Cursor).
 *
 * @example
 * ```typescript
 * // Basic usage
 * const plugin = createCodeBuddyIDEPlugin()
 *
 * // With custom options
 * const plugin = createCodeBuddyIDEPlugin({
 *   targetDir: '.codebuddy/.rules/',
 *   cleanTarget: false,
 * })
 * ```
 *
 * @see Requirements 33.7
 */
export function createCodeBuddyIDEPlugin(options: CodeBuddyIDEPluginOptions = {}): OutputPlugin {
  const {
    cleanTarget = false,
    emitFiles = true,
    targetDir = '.codebuddy/.rules',
  } = options

  // Track processed bundles for reporting
  let memoryPromptBundles: InputBundle[] = []
  let emittedFiles: EmittedFile[] = []

  return {
    name: 'codeBuddyIde',
    priority: 100,

    // Extends CursorIDEPlugin (Requirement 33.7)
    extends: 'cursorIde',

    // Handle MemoryPrompt input type (Requirement 33.7)
    inputTypes: HANDLED_INPUT_TYPES,

    // Output configuration with .codebuddy/.rules/ path (Requirement 33.7)
    outputs: DEFAULT_OUTPUTS,

    // Filename transformation rules (same as Cursor)
    filenameTransform: DEFAULT_FILENAME_TRANSFORM,

    /**
     * Build start hook - initialize plugin state
     */
    buildStart(ctx: PluginContext, _params: BuildStartParams): void {
      memoryPromptBundles = []
      emittedFiles = []
      ctx.log.debug('CodeBuddyIDEPlugin: Starting build')
    },

    /**
     * Transform filename hook - convert *.md to *.mdc
     * @see Requirements 33.7, 14.1
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
     * @see Requirements 33.7
     */
    async generateBundle(ctx: PluginContext, _params: GenerateBundleParams): Promise<void> {
      // Process MemoryPrompt bundles
      const memoryBundles = ctx.getInputBundles(InputType.MEMORY_PROMPT)

      if (memoryBundles.length > 0) {
        ctx.log.debug(
          `CodeBuddyIDEPlugin: Processing ${memoryBundles.length} MemoryPrompt bundle(s)`,
        )

        for (const bundle of memoryBundles) {
          const emittedFile = processMemoryPromptForCodeBuddy(bundle, ctx)

          if (emitFiles) {
            ctx.emitFile(emittedFile)
            emittedFiles.push(emittedFile)
          }

          memoryPromptBundles.push(bundle)
        }
      }

      // Store processed data in registry for potential child plugins
      ctx.registry.set('codeBuddyIde', 'memoryPromptBundles', memoryPromptBundles)
      ctx.registry.set('codeBuddyIde', 'emittedFiles', emittedFiles)
      ctx.registry.set('codeBuddyIde', 'targetDir', targetDir)
    },

    /**
     * Write bundle hook - write rules files to .codebuddy/.rules/
     *
     * @see Requirement 33.7
     */
    async writeBundle(ctx: PluginContext, params: WriteBundleParams): Promise<void> {
      if (!emitFiles) {
        ctx.log.debug('CodeBuddyIDEPlugin: File emission disabled')
        return
      }

      const { files } = params

      // Filter to only our emitted files
      const codeBuddyFiles = files.filter(
        (f) => f.inputType === InputType.MEMORY_PROMPT && f.fileName.endsWith('.mdc'),
      )

      if (codeBuddyFiles.length === 0) {
        ctx.log.debug('CodeBuddyIDEPlugin: No files to write')
        return
      }

      // Resolve target directory
      const resolvedTargetDir = ctx.paths.resolve(targetDir)

      // Clean target directory if configured
      if (cleanTarget) {
        ctx.log.debug('CodeBuddyIDEPlugin: Cleaning target directory')
        try {
          await ctx.fs.cleanDir(resolvedTargetDir)
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          ctx.log.warn(`CodeBuddyIDEPlugin: Failed to clean target directory: ${errorMsg}`)
        }
      }

      // Ensure target directory exists
      await ctx.fs.ensureDir(resolvedTargetDir)

      let written = 0

      for (const file of codeBuddyFiles) {
        try {
          const targetPath = ctx.path.join(resolvedTargetDir, file.fileName)
          const targetFileDir = ctx.path.dirname(targetPath)

          // Ensure parent directory exists
          await ctx.fs.ensureDir(targetFileDir)

          // Write the file
          await ctx.fs.writeFile(targetPath, file.source)
          written++

          ctx.log.debug(`CodeBuddyIDEPlugin: Wrote ${targetPath}`)
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          ctx.log.error(`CodeBuddyIDEPlugin: Failed to write ${file.fileName}: ${errorMsg}`)
        }
      }

      if (written > 0) {
        ctx.log.info(`CodeBuddyIDEPlugin: Wrote ${written} file(s) to CodeBuddy rules`)
      }
    },
  }
}

// Re-export helper functions from CursorIDEPlugin for consistency
export {
  filterCursorHandledBundles,
  generateCursorOutputFilename,
  transformCursorFilename,
}

export default createCodeBuddyIDEPlugin
