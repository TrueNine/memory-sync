/**
 * GeminiCLIPlugin - CLI output plugin for Gemini AI assistant
 * Extends AgentsMdPlugin to handle MemoryPrompt and GlobalPrompt input types
 * Emits GEMINI.md to workspace and global prompts to ~/.gemini/
 *
 * @see Requirements 32.3, 32.4
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
import os from 'node:os'
import { InputType } from '../core/types'
import { getWorkspaceFromBundle, processMemoryPromptBundle } from './AgentsMdPlugin'

/**
 * Options for GeminiCLIPlugin
 */
export interface GeminiCLIPluginOptions {
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
   * Whether to emit to global config directory (~/.gemini/)
   * Default: true
   */
  emitGlobal?: boolean

  /**
   * Whether to emit to workspace directory
   * Default: true
   */
  emitWorkspace?: boolean

  /**
   * Custom global config directory path (for testing)
   * Default: ~/.gemini/
   */
  globalConfigPath?: string

  /**
   * Output filename for GEMINI.md in workspace
   * Default: 'GEMINI.md'
   */
  outputFilename?: string
}

/**
 * Default plugin outputs for GeminiCLIPlugin
 * Emits GEMINI.md to workspace and global prompts to ~/.gemini/
 *
 * @see Requirement 32.4
 */
const DEFAULT_OUTPUTS: PluginOutput[] = [
  {
    id: 'workspace-gemini',
    category: 'cli',
    tool: 'gemini',
    targetType: 'workspace',
    path: 'GEMINI.md',
    enabled: true,
  },
  {
    id: 'global-config',
    category: 'cli',
    tool: 'gemini',
    targetType: 'globalConfig',
    path: '.gemini',
    enabled: true,
  },
]

/**
 * Input types handled by GeminiCLIPlugin
 * @see Requirement 32.3
 */
const HANDLED_INPUT_TYPES: InputType[] = [
  InputType.MEMORY_PROMPT,
  InputType.GLOBAL_PROMPT,
]

/**
 * Get the output filename for a GlobalPrompt InputBundle
 * Preserves original filename from the bundle path
 *
 * @param bundle - InputBundle to get filename from
 * @returns Output filename
 */
export function getGlobalPromptFilename(bundle: InputBundle, ctx: PluginContext): string {
  return ctx.path.basename(bundle.path)
}

/**
 * Process a GlobalPrompt InputBundle and prepare it for emission
 *
 * @param bundle - InputBundle of type GlobalPrompt
 * @param targetType - Target type (globalConfig or workspace)
 * @returns EmittedFile ready for writing
 */
export function processGlobalPromptBundle(
  bundle: InputBundle,
  targetType: 'globalConfig' | 'workspace',
  ctx: PluginContext,
): EmittedFile {
  const filename = getGlobalPromptFilename(bundle, ctx)

  const emittedFile: EmittedFile = {
    type: 'asset',
    fileName: filename,
    source: bundle.content,
    targetType,
    inputType: InputType.GLOBAL_PROMPT,
  }

  // Only set frontMatter if it exists
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
export function filterGeminiHandledBundles(bundles: InputBundle[]): InputBundle[] {
  return bundles.filter((bundle) => HANDLED_INPUT_TYPES.includes(bundle.type))
}

/**
 * GeminiCLIPlugin - CLI output plugin for Gemini AI assistant
 *
 * Extends AgentsMdPlugin functionality to handle MemoryPrompt and GlobalPrompt input types.
 * Emits GEMINI.md to workspace root and global prompts to ~/.gemini/ directory.
 *
 * This plugin inherits MemoryPrompt handling from AgentsMdPlugin and adds
 * GlobalPrompt handling for global configuration files.
 *
 * @example
 * ```typescript
 * // Basic usage
 * const plugin = createGeminiCLIPlugin()
 *
 * // With custom options
 * const plugin = createGeminiCLIPlugin({
 *   outputFilename: 'GEMINI.md',
 *   emitGlobal: true,
 *   emitWorkspace: true,
 * })
 * ```
 *
 * @see Requirements 32.3, 32.4
 */
export function createGeminiCLIPlugin(options: GeminiCLIPluginOptions = {}): OutputPlugin {
  const {
    cleanTarget = false,
    emitFiles = true,
    emitGlobal = true,
    emitWorkspace = true,
    // Note: globalConfigPath default is handled in writeBundle to use ctx or os.homedir
    globalConfigPath,
    outputFilename = 'GEMINI.md',
  } = options

  // Track processed bundles for reporting
  let memoryPromptBundles: InputBundle[] = []
  let globalPromptBundles: InputBundle[] = []
  let workspaceEmittedFiles: EmittedFile[] = []
  let globalEmittedFiles: EmittedFile[] = []

  return {
    name: 'geminiCli',
    priority: 100,

    // Extends AgentsMdPlugin (Requirement 32.3)
    extends: 'agentsMd',

    // Handle MemoryPrompt and GlobalPrompt input types (Requirement 32.3)
    inputTypes: HANDLED_INPUT_TYPES,

    // Output configuration (Requirement 32.4)
    outputs: DEFAULT_OUTPUTS,

    /**
     * Build start hook - initialize plugin state
     */
    buildStart(ctx: PluginContext, _params: BuildStartParams): void {
      memoryPromptBundles = []
      globalPromptBundles = []
      workspaceEmittedFiles = []
      globalEmittedFiles = []
      ctx.log.debug('GeminiCLIPlugin: Starting build')
    },

    /**
     * Generate bundle hook - process MemoryPrompt and GlobalPrompt bundles
     * Collects all GEMINI.md files and global prompts for emission
     *
     * @see Requirements 32.3, 32.4
     */
    async generateBundle(ctx: PluginContext, _params: GenerateBundleParams): Promise<void> {
      // Process MemoryPrompt bundles (inherited from AgentsMdPlugin)
      const memoryBundles = ctx.getInputBundles(InputType.MEMORY_PROMPT)

      if (memoryBundles.length > 0) {
        ctx.log.debug(`GeminiCLIPlugin: Processing ${memoryBundles.length} MemoryPrompt bundle(s)`)

        for (const bundle of memoryBundles) {
          // Use inherited processMemoryPromptBundle with GEMINI.md filename
          const emittedFile = processMemoryPromptBundle(bundle, outputFilename)

          if (emitFiles && emitWorkspace) {
            ctx.emitFile(emittedFile)
            workspaceEmittedFiles.push(emittedFile)
          }

          memoryPromptBundles.push(bundle)
        }
      }

      // Process GlobalPrompt bundles (Requirement 32.4)
      const globalBundles = ctx.getInputBundles(InputType.GLOBAL_PROMPT)

      if (globalBundles.length > 0) {
        ctx.log.debug(`GeminiCLIPlugin: Processing ${globalBundles.length} GlobalPrompt bundle(s)`)

        for (const bundle of globalBundles) {
          // Emit to global config directory
          if (emitGlobal) {
            const globalFile = processGlobalPromptBundle(bundle, 'globalConfig', ctx)

            if (emitFiles) {
              ctx.emitFile(globalFile)
              globalEmittedFiles.push(globalFile)
            }
          }

          globalPromptBundles.push(bundle)
        }
      }

      // Store processed data in registry for potential child plugins
      ctx.registry.set('geminiCli', 'memoryPromptBundles', memoryPromptBundles)
      ctx.registry.set('geminiCli', 'globalPromptBundles', globalPromptBundles)
      ctx.registry.set('geminiCli', 'workspaceEmittedFiles', workspaceEmittedFiles)
      ctx.registry.set('geminiCli', 'globalEmittedFiles', globalEmittedFiles)
      ctx.registry.set('geminiCli', 'outputFilename', outputFilename)
    },

    /**
     * Write bundle hook - write GEMINI.md to workspace and global prompts to ~/.gemini/
     *
     * @see Requirement 32.4
     */
    async writeBundle(ctx: PluginContext, params: WriteBundleParams): Promise<void> {
      if (!emitFiles) {
        ctx.log.debug('GeminiCLIPlugin: File emission disabled')
        return
      }

      const { files } = params

      // Filter to only our emitted files
      const geminiFiles = files.filter(
        (f) =>
          (f.inputType === InputType.MEMORY_PROMPT && f.fileName === outputFilename)
          || f.inputType === InputType.GLOBAL_PROMPT,
      )

      if (geminiFiles.length === 0) {
        ctx.log.debug('GeminiCLIPlugin: No files to write')
        return
      }

      // Clean target directories if configured
      if (cleanTarget) {
        ctx.log.debug('GeminiCLIPlugin: Cleaning target directories')

        if (emitGlobal) {
          try {
            const resolvedGlobalPath = globalConfigPath ?? (os.homedir() + (os.platform() === 'win32' ? '\\.gemini' : '/.gemini'))
            await ctx.fs.cleanDir(resolvedGlobalPath)
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            ctx.log.warn(`GeminiCLIPlugin: Failed to clean global directory: ${errorMsg}`)
          }
        }
      }

      let workspaceWritten = 0
      let globalWritten = 0

      for (const file of geminiFiles) {
        try {
          if (file.inputType === InputType.MEMORY_PROMPT && emitWorkspace) {
            // Write GEMINI.md to workspace root
            const bundle = memoryPromptBundles.find((b) => b.content === file.source)

            if (bundle) {
              const workspace = getWorkspaceFromBundle(bundle, ctx)
              const targetPath = workspace
                ? ctx.paths.resolve(workspace, file.fileName)
                : ctx.paths.resolve(file.fileName)

              // Ensure parent directory exists
              const targetDir = ctx.path.dirname(targetPath)
              await ctx.fs.ensureDir(targetDir)

              // Write the file
              await ctx.fs.writeFile(targetPath, file.source)
              workspaceWritten++

              ctx.log.debug(`GeminiCLIPlugin: Wrote workspace ${targetPath}`)
            }
          } else if (file.inputType === InputType.GLOBAL_PROMPT && emitGlobal) {
            // Write to global config directory (~/.gemini/)
            const resolvedGlobalPath = globalConfigPath ?? (os.homedir() + (os.platform() === 'win32' ? '\\.gemini' : '/.gemini'))
            const targetPath = ctx.path.join(resolvedGlobalPath, file.fileName)
            const targetDir = ctx.path.dirname(targetPath)

            await ctx.fs.ensureDir(targetDir)
            await ctx.fs.writeFile(targetPath, file.source)
            globalWritten++

            ctx.log.debug(`GeminiCLIPlugin: Wrote global ${targetPath}`)
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          ctx.log.error(`GeminiCLIPlugin: Failed to write ${file.fileName}: ${errorMsg}`)
        }
      }

      const total = workspaceWritten + globalWritten
      if (total > 0) {
        ctx.log.info(
          `GeminiCLIPlugin: Wrote ${total} file(s) (${workspaceWritten} workspace, ${globalWritten} global)`,
        )
      }
    },
  }
}

export default createGeminiCLIPlugin
