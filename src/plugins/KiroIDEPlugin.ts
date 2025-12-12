/**
 * KiroIDEPlugin - IDE output plugin for Kiro steering files
 * Handles MemoryPrompt and GlobalPrompt input types
 * Emits to .kiro/steering/ with appropriate front matter
 *
 * @see Requirements 33.1, 33.2
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
  generateFrontMatterByType,
} from '../core/capabilities/frontMatter'

import { FrontMatterType, InputType } from '../core/types'

/**
 * Options for KiroIDEPlugin
 */
export interface KiroIDEPluginOptions {
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
   * Target directory for steering files
   * Default: .kiro/steering/
   */
  targetDir?: string

  /**
   * Default front matter type for MemoryPrompt files
   * Default: KIRO_FILE_MATCH
   */
  memoryPromptFrontMatterType?: FrontMatterType

  /**
   * Default front matter type for GlobalPrompt files
   * Default: KIRO_ALWAYS
   */
  globalPromptFrontMatterType?: FrontMatterType
}

/**
 * Default plugin outputs for KiroIDEPlugin
 * Emits to .kiro/steering/ directory
 *
 * @see Requirement 33.2
 */
const DEFAULT_OUTPUTS: PluginOutput[] = [
  {
    id: 'workspace-steering',
    category: 'ide',
    tool: 'kiro',
    targetType: 'workspace',
    path: '.kiro/steering',
    enabled: true,
  },
]

/**
 * Input types handled by KiroIDEPlugin
 * @see Requirement 33.1
 */
const HANDLED_INPUT_TYPES: InputType[] = [
  InputType.MEMORY_PROMPT,
  InputType.GLOBAL_PROMPT,
]

/**
 * Generate file match pattern from InputBundle path
 * Creates a glob pattern for Kiro's fileMatch inclusion mode
 *
 * @param bundle - InputBundle containing the file path
 * @param ctx - Plugin context for path utilities
 * @returns Glob pattern for file matching
 */
export function generateKiroFileMatchPattern(bundle: InputBundle, ctx: PluginContext): string {
  const dir = ctx.path.dirname(bundle.path)
  const normalizedDir = dir.replace(/\\/g, '/')

  if (normalizedDir === '.' || normalizedDir === '') {
    return '**/*'
  }

  return `**/${normalizedDir}/**`
}

/**
 * Generate output filename for Kiro steering file
 * Converts the bundle path to a flat filename suitable for steering directory
 *
 * @param bundle - InputBundle containing the file path
 * @param ctx - Plugin context for path utilities
 * @returns Output filename for the steering file
 */
export function generateKiroOutputFilename(bundle: InputBundle, ctx: PluginContext): string {
  const dir = ctx.path.dirname(bundle.path)
  const normalizedDir = dir.replace(/[\\/]/g, '_').replace(/^_+|_+$/g, '')

  if (normalizedDir === '' || normalizedDir === '.') {
    return '_root.md'
  }

  return `${normalizedDir}.md`
}

/**
 * Process a MemoryPrompt InputBundle for Kiro steering
 * Adds fileMatch front matter based on the source directory
 *
 * @param bundle - InputBundle of type MemoryPrompt
 * @param ctx - Plugin context for capabilities
 * @returns EmittedFile ready for writing
 */
export function processMemoryPromptForKiro(
  bundle: InputBundle,
  ctx: PluginContext,
): EmittedFile {
  const pattern = generateKiroFileMatchPattern(bundle, ctx)
  const outputFilename = generateKiroOutputFilename(bundle, ctx)

  // Add fileMatch front matter to content
  const transformedContent = addFrontMatterToContent(
    bundle.content,
    FrontMatterType.KIRO_FILE_MATCH,
    pattern,
  )

  const frontMatter = generateFrontMatterByType(FrontMatterType.KIRO_FILE_MATCH, { type: FrontMatterType.KIRO_FILE_MATCH, filePattern: pattern })

  ctx.log.debug(`KiroIDEPlugin: Generated pattern "${pattern}" for ${bundle.path}`)

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
 * Process a GlobalPrompt InputBundle for Kiro steering
 * Adds always inclusion front matter
 *
 * @param bundle - InputBundle of type GlobalPrompt
 * @param ctx - Plugin context for capabilities
 * @returns EmittedFile ready for writing
 */
export function processGlobalPromptForKiro(
  bundle: InputBundle,
  ctx: PluginContext,
): EmittedFile {
  const outputFilename = ctx.path.basename(bundle.path)

  // Add always inclusion front matter to content
  const transformedContent = addFrontMatterToContent(
    bundle.content,
    FrontMatterType.KIRO_ALWAYS,
  )

  const frontMatter = generateFrontMatterByType(FrontMatterType.KIRO_ALWAYS, { type: FrontMatterType.KIRO_ALWAYS })

  ctx.log.debug(`KiroIDEPlugin: Processing GlobalPrompt ${bundle.path}`)

  return {
    type: 'asset',
    fileName: outputFilename,
    source: transformedContent,
    targetType: 'workspace',
    inputType: InputType.GLOBAL_PROMPT,
    frontMatter,
  }
}

/**
 * Filter InputBundles to only include handled types
 *
 * @param bundles - Array of InputBundles
 * @returns Filtered array containing only handled input types
 */
export function filterKiroHandledBundles(bundles: InputBundle[]): InputBundle[] {
  return bundles.filter((bundle) => HANDLED_INPUT_TYPES.includes(bundle.type))
}

/**
 * KiroIDEPlugin - IDE output plugin for Kiro steering files
 *
 * Handles MemoryPrompt and GlobalPrompt input types.
 * Emits files to .kiro/steering/ directory with appropriate front matter:
 * - MemoryPrompt: fileMatch front matter with pattern based on source directory
 * - GlobalPrompt: always inclusion front matter
 *
 * @example
 * ```typescript
 * // Basic usage
 * const plugin = createKiroIDEPlugin()
 *
 * // With custom options
 * const plugin = createKiroIDEPlugin({
 *   targetDir: '.kiro/steering/',
 *   cleanTarget: false,
 * })
 * ```
 *
 * @see Requirements 33.1, 33.2
 */
export function createKiroIDEPlugin(options: KiroIDEPluginOptions = {}): OutputPlugin {
  const {
    cleanTarget = false,
    emitFiles = true,
    targetDir = '.kiro/steering',
  } = options

  // Track processed bundles for reporting
  let memoryPromptBundles: InputBundle[] = []
  let globalPromptBundles: InputBundle[] = []
  let emittedFiles: EmittedFile[] = []

  return {
    name: 'kiroIde',
    priority: 100,

    // Handle MemoryPrompt and GlobalPrompt input types (Requirement 33.1)
    inputTypes: HANDLED_INPUT_TYPES,

    // Output configuration (Requirement 33.2)
    outputs: DEFAULT_OUTPUTS,

    /**
     * Build start hook - initialize plugin state
     */
    buildStart(ctx: PluginContext, _params: BuildStartParams): void {
      memoryPromptBundles = []
      globalPromptBundles = []
      emittedFiles = []
      ctx.log.debug('KiroIDEPlugin: Starting build')
    },

    /**
     * Generate bundle hook - process MemoryPrompt and GlobalPrompt bundles
     * Collects all input bundles and prepares them for emission with Kiro front matter
     *
     * @see Requirements 33.1, 33.2
     */
    async generateBundle(ctx: PluginContext, _params: GenerateBundleParams): Promise<void> {
      // Process MemoryPrompt bundles
      const memoryBundles = ctx.getInputBundles(InputType.MEMORY_PROMPT)

      if (memoryBundles.length > 0) {
        ctx.log.debug(`KiroIDEPlugin: Processing ${memoryBundles.length} MemoryPrompt bundle(s)`)

        for (const bundle of memoryBundles) {
          const emittedFile = processMemoryPromptForKiro(bundle, ctx)

          if (emitFiles) {
            ctx.emitFile(emittedFile)
            emittedFiles.push(emittedFile)
          }

          memoryPromptBundles.push(bundle)
        }
      }

      // Process GlobalPrompt bundles
      const globalBundles = ctx.getInputBundles(InputType.GLOBAL_PROMPT)

      if (globalBundles.length > 0) {
        ctx.log.debug(`KiroIDEPlugin: Processing ${globalBundles.length} GlobalPrompt bundle(s)`)

        for (const bundle of globalBundles) {
          const emittedFile = processGlobalPromptForKiro(bundle, ctx)

          if (emitFiles) {
            ctx.emitFile(emittedFile)
            emittedFiles.push(emittedFile)
          }

          globalPromptBundles.push(bundle)
        }
      }

      // Store processed data in registry for potential child plugins
      ctx.registry.set('kiroIde', 'memoryPromptBundles', memoryPromptBundles)
      ctx.registry.set('kiroIde', 'globalPromptBundles', globalPromptBundles)
      ctx.registry.set('kiroIde', 'emittedFiles', emittedFiles)
      ctx.registry.set('kiroIde', 'targetDir', targetDir)
    },

    /**
     * Write bundle hook - write steering files to .kiro/steering/
     *
     * @see Requirement 33.2
     */
    async writeBundle(ctx: PluginContext, params: WriteBundleParams): Promise<void> {
      if (!emitFiles) {
        ctx.log.debug('KiroIDEPlugin: File emission disabled')
        return
      }

      const { files } = params

      // Filter to only our emitted files
      const kiroFiles = files.filter(
        (f) =>
          f.inputType === InputType.MEMORY_PROMPT
          || f.inputType === InputType.GLOBAL_PROMPT,
      )

      if (kiroFiles.length === 0) {
        ctx.log.debug('KiroIDEPlugin: No files to write')
        return
      }

      // Resolve target directory
      const resolvedTargetDir = ctx.paths.resolve(targetDir)

      // Clean target directory if configured
      if (cleanTarget) {
        ctx.log.debug('KiroIDEPlugin: Cleaning target directory')
        try {
          await ctx.fs.cleanDir(resolvedTargetDir)
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          ctx.log.warn(`KiroIDEPlugin: Failed to clean target directory: ${errorMsg}`)
        }
      }

      // Ensure target directory exists
      await ctx.fs.ensureDir(resolvedTargetDir)

      let written = 0

      for (const file of kiroFiles) {
        try {
          const targetPath = ctx.path.join(resolvedTargetDir, file.fileName)
          const targetFileDir = ctx.path.dirname(targetPath)

          // Ensure parent directory exists
          await ctx.fs.ensureDir(targetFileDir)

          // Write the file
          await ctx.fs.writeFile(targetPath, file.source)
          written++

          ctx.log.debug(`KiroIDEPlugin: Wrote ${targetPath}`)
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          ctx.log.error(`KiroIDEPlugin: Failed to write ${file.fileName}: ${errorMsg}`)
        }
      }

      if (written > 0) {
        ctx.log.info(`KiroIDEPlugin: Wrote ${written} file(s) to Kiro steering`)
      }
    },
  }
}
