/**
 * AntigravityIDEPlugin - IDE output plugin for Antigravity AI assistant
 * Extends WindsurfIDEPlugin with different output paths (.agent/)
 * Antigravity is built by former Windsurf team, same architecture
 *
 * @see Requirements 33.5
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
import { FrontMatterType, InputType } from '../core/types'
import { addFrontMatterToContent } from './FrontMatterPlugin'
import {
  filterWindsurfHandledBundles,
  generateWindsurfOutputFilename,
  generateWorkflowFrontMatter,
} from './WindsurfIDEPlugin'

/**
 * Options for AntigravityIDEPlugin
 */
export interface AntigravityIDEPluginOptions {
  /**
   * Whether to clean target directories before export
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
   * Default: .agent/workflows/
   */
  workflowsDir?: string

  /**
   * Target directory for rules files
   * Default: .agent/rules/
   */
  rulesDir?: string

  /**
   * Value for auto_execution_mode front matter
   * Default: 3
   */
  autoExecutionMode?: number
}

/**
 * Default plugin outputs for AntigravityIDEPlugin
 * Emits to .agent/workflows/ and .agent/rules/ directories
 *
 * @see Requirement 33.5
 */
const DEFAULT_OUTPUTS: PluginOutput[] = [
  {
    id: 'workspace-workflows',
    category: 'ide',
    tool: 'antigravity',
    targetType: 'workspace',
    path: '.agent/workflows',
    enabled: true,
  },
  {
    id: 'workspace-rules',
    category: 'ide',
    tool: 'antigravity',
    targetType: 'workspace',
    path: '.agent/rules',
    enabled: true,
  },
]

/**
 * Input types handled by AntigravityIDEPlugin
 * Same as WindsurfIDEPlugin - handles FastCommand
 * Additionally handles MemoryPrompt for rules
 * @see Requirement 33.5
 */
const HANDLED_INPUT_TYPES: InputType[] = [
  InputType.FAST_COMMAND,
  InputType.MEMORY_PROMPT,
]

/**
 * Generate output filename for Antigravity workflow file
 * Preserves the original filename from the bundle path
 *
 * @param bundle - InputBundle containing the file path
 * @param ctx - Plugin context for path utilities
 * @returns Output filename for the workflow file
 */
export function generateAntigravityOutputFilename(bundle: InputBundle, ctx: PluginContext): string {
  return ctx.path.basename(bundle.path)
}

/**
 * Process a FastCommand InputBundle for Antigravity workflow
 * Adds auto_execution_mode front matter to the content
 *
 * @param bundle - InputBundle of type FastCommand
 * @param ctx - Plugin context for capabilities
 * @param autoExecutionMode - Value for auto_execution_mode (default: 3)
 * @returns EmittedFile ready for writing
 */
export function processFastCommandForAntigravity(
  bundle: InputBundle,
  ctx: PluginContext,
  autoExecutionMode: number = 3,
): EmittedFile {
  const outputFilename = generateAntigravityOutputFilename(bundle, ctx)

  // Add workflow front matter to content
  const transformedContent = addFrontMatterToContent(
    bundle.content,
    FrontMatterType.WORKFLOW_AUTO,
    '',
    { auto_execution_mode: autoExecutionMode },
  )

  const frontMatter = generateWorkflowFrontMatter(autoExecutionMode)

  ctx.log.debug(`AntigravityIDEPlugin: Processing FastCommand ${bundle.path}`)

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
 * Process a MemoryPrompt InputBundle for Antigravity rules
 * Copies the content without transformation
 *
 * @param bundle - InputBundle of type MemoryPrompt
 * @param ctx - Plugin context for capabilities
 * @returns EmittedFile ready for writing
 */
export function processMemoryPromptForAntigravity(
  bundle: InputBundle,
  ctx: PluginContext,
): EmittedFile {
  const outputFilename = generateAntigravityOutputFilename(bundle, ctx)

  ctx.log.debug(`AntigravityIDEPlugin: Processing MemoryPrompt ${bundle.path}`)

  return {
    type: 'asset',
    fileName: outputFilename,
    source: bundle.content,
    targetType: 'workspace',
    inputType: InputType.MEMORY_PROMPT,
  }
}

/**
 * Filter InputBundles to only include handled types
 *
 * @param bundles - Array of InputBundles
 * @returns Filtered array containing only handled input types
 */
export function filterAntigravityHandledBundles(bundles: InputBundle[]): InputBundle[] {
  return bundles.filter((bundle) => HANDLED_INPUT_TYPES.includes(bundle.type))
}

/**
 * AntigravityIDEPlugin - IDE output plugin for Antigravity AI assistant
 *
 * Extends WindsurfIDEPlugin functionality with different output paths (.agent/).
 * Handles FastCommand input type for workflows and MemoryPrompt for rules.
 * Emits files to .agent/workflows/ and .agent/rules/ directories.
 *
 * Directory structure:
 * - FastCommand: .agent/workflows/
 * - MemoryPrompt: .agent/rules/
 *
 * @example
 * ```typescript
 * // Basic usage
 * const plugin = createAntigravityIDEPlugin()
 *
 * // With custom options
 * const plugin = createAntigravityIDEPlugin({
 *   workflowsDir: '.agent/workflows/',
 *   rulesDir: '.agent/rules/',
 *   autoExecutionMode: 3,
 *   cleanTarget: false,
 * })
 * ```
 *
 * @see Requirements 33.5
 */
export function createAntigravityIDEPlugin(
  options: AntigravityIDEPluginOptions = {},
): OutputPlugin {
  const {
    cleanTarget = false,
    emitFiles = true,
    workflowsDir = '.agent/workflows',
    rulesDir = '.agent/rules',
    autoExecutionMode = 3,
  } = options

  // Track processed bundles for reporting
  let fastCommandBundles: InputBundle[] = []
  let memoryPromptBundles: InputBundle[] = []
  let workflowEmittedFiles: EmittedFile[] = []
  let rulesEmittedFiles: EmittedFile[] = []

  return {
    name: 'antigravityIde',
    priority: 100,

    // Extends WindsurfIDEPlugin (Requirement 33.5)
    extends: 'windsurfIde',

    // Handle FastCommand and MemoryPrompt input types (Requirement 33.5)
    inputTypes: HANDLED_INPUT_TYPES,

    // Output configuration with .agent/ paths (Requirement 33.5)
    outputs: DEFAULT_OUTPUTS,

    /**
     * Build start hook - initialize plugin state
     */
    buildStart(ctx: PluginContext, _params: BuildStartParams): void {
      fastCommandBundles = []
      memoryPromptBundles = []
      workflowEmittedFiles = []
      rulesEmittedFiles = []
      ctx.log.debug('AntigravityIDEPlugin: Starting build')
    },

    /**
     * Generate bundle hook - process FastCommand and MemoryPrompt bundles
     * Collects all input bundles and prepares them for emission
     *
     * @see Requirements 33.5
     */
    async generateBundle(ctx: PluginContext, _params: GenerateBundleParams): Promise<void> {
      // Process FastCommand bundles for workflows
      const commandBundles = ctx.getInputBundles(InputType.FAST_COMMAND)

      if (commandBundles.length > 0) {
        ctx.log.debug(
          `AntigravityIDEPlugin: Processing ${commandBundles.length} FastCommand bundle(s)`,
        )

        for (const bundle of commandBundles) {
          const emittedFile = processFastCommandForAntigravity(bundle, ctx, autoExecutionMode)

          if (emitFiles) {
            ctx.emitFile(emittedFile)
            workflowEmittedFiles.push(emittedFile)
          }

          fastCommandBundles.push(bundle)
        }
      }

      // Process MemoryPrompt bundles for rules
      const promptBundles = ctx.getInputBundles(InputType.MEMORY_PROMPT)

      if (promptBundles.length > 0) {
        ctx.log.debug(
          `AntigravityIDEPlugin: Processing ${promptBundles.length} MemoryPrompt bundle(s)`,
        )

        for (const bundle of promptBundles) {
          const emittedFile = processMemoryPromptForAntigravity(bundle, ctx)

          if (emitFiles) {
            ctx.emitFile(emittedFile)
            rulesEmittedFiles.push(emittedFile)
          }

          memoryPromptBundles.push(bundle)
        }
      }

      // Store processed data in registry for potential child plugins
      ctx.registry.set('antigravityIde', 'fastCommandBundles', fastCommandBundles)
      ctx.registry.set('antigravityIde', 'memoryPromptBundles', memoryPromptBundles)
      ctx.registry.set('antigravityIde', 'workflowEmittedFiles', workflowEmittedFiles)
      ctx.registry.set('antigravityIde', 'rulesEmittedFiles', rulesEmittedFiles)
      ctx.registry.set('antigravityIde', 'workflowsDir', workflowsDir)
      ctx.registry.set('antigravityIde', 'rulesDir', rulesDir)
      ctx.registry.set('antigravityIde', 'autoExecutionMode', autoExecutionMode)
    },

    /**
     * Write bundle hook - write workflow and rules files to .agent/ directories
     *
     * @see Requirement 33.5
     */
    async writeBundle(ctx: PluginContext, params: WriteBundleParams): Promise<void> {
      if (!emitFiles) {
        ctx.log.debug('AntigravityIDEPlugin: File emission disabled')
        return
      }

      const { files } = params

      // Filter to only our emitted files
      const antigravityFiles = files.filter(
        (f) => f.inputType === InputType.FAST_COMMAND || f.inputType === InputType.MEMORY_PROMPT,
      )

      if (antigravityFiles.length === 0) {
        ctx.log.debug('AntigravityIDEPlugin: No files to write')
        return
      }

      // Resolve target directories
      const resolvedWorkflowsDir = ctx.paths.resolve(workflowsDir)
      const resolvedRulesDir = ctx.paths.resolve(rulesDir)

      // Clean target directories if configured
      if (cleanTarget) {
        ctx.log.debug('AntigravityIDEPlugin: Cleaning target directories')
        try {
          await ctx.fs.cleanDir(resolvedWorkflowsDir)
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          ctx.log.warn(`AntigravityIDEPlugin: Failed to clean workflows directory: ${errorMsg}`)
        }
        try {
          await ctx.fs.cleanDir(resolvedRulesDir)
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          ctx.log.warn(`AntigravityIDEPlugin: Failed to clean rules directory: ${errorMsg}`)
        }
      }

      // Ensure target directories exist
      await ctx.fs.ensureDir(resolvedWorkflowsDir)
      await ctx.fs.ensureDir(resolvedRulesDir)

      let workflowsWritten = 0
      let rulesWritten = 0

      for (const file of antigravityFiles) {
        try {
          if (file.inputType === InputType.FAST_COMMAND) {
            // Write to workflows directory
            const targetPath = ctx.path.join(resolvedWorkflowsDir, file.fileName)
            const targetFileDir = ctx.path.dirname(targetPath)

            await ctx.fs.ensureDir(targetFileDir)
            await ctx.fs.writeFile(targetPath, file.source)
            workflowsWritten++

            ctx.log.debug(`AntigravityIDEPlugin: Wrote workflow ${targetPath}`)
          } else if (file.inputType === InputType.MEMORY_PROMPT) {
            // Write to rules directory
            const targetPath = ctx.path.join(resolvedRulesDir, file.fileName)
            const targetFileDir = ctx.path.dirname(targetPath)

            await ctx.fs.ensureDir(targetFileDir)
            await ctx.fs.writeFile(targetPath, file.source)
            rulesWritten++

            ctx.log.debug(`AntigravityIDEPlugin: Wrote rule ${targetPath}`)
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          ctx.log.error(`AntigravityIDEPlugin: Failed to write ${file.fileName}: ${errorMsg}`)
        }
      }

      const total = workflowsWritten + rulesWritten
      if (total > 0) {
        ctx.log.info(
          `AntigravityIDEPlugin: Wrote ${total} file(s) (${workflowsWritten} workflows, ${rulesWritten} rules)`,
        )
      }
    },
  }
}

// Re-export helper functions from WindsurfIDEPlugin for consistency
export {
  filterWindsurfHandledBundles,
  generateWindsurfOutputFilename,
  generateWorkflowFrontMatter,
}

export default createAntigravityIDEPlugin
