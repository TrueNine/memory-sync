/**
 * AgentsMdPlugin - Base output plugin for AGENTS.md memory prompt files
 * Handles MemoryPrompt input type and maps AGENTS.md to workspace root
 *
 * This is a base plugin that other plugins (GeminiCLIPlugin, CodexCLIPlugin) can extend
 * to inherit MemoryPrompt handling functionality.
 *
 * @see Requirements 35.1, 35.2
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
 * Options for AgentsMdPlugin
 */
export interface AgentsMdPluginOptions {
  /**
   * Whether to clean target directory before export
   * Default: false (base plugin does not clean by default)
   */
  cleanTarget?: boolean

  /**
   * Output filename for AGENTS.md in workspace root
   * Default: 'AGENTS.md'
   */
  outputFilename?: string

  /**
   * Whether to emit files (can be disabled for testing)
   * Default: true
   */
  emitFiles?: boolean
}

/**
 * Default plugin outputs for AgentsMdPlugin
 * Maps AGENTS.md to workspace root
 *
 * @see Requirement 35.2
 */
const DEFAULT_OUTPUTS: PluginOutput[] = [
  {
    id: 'workspace-root',
    category: 'ide',
    tool: 'agents',
    targetType: 'workspace',
    path: '',
    enabled: true,
  },
]

/**
 * Process a MemoryPrompt InputBundle and prepare it for emission
 * This is the core logic that child plugins can reuse
 *
 * @param bundle - InputBundle of type MemoryPrompt
 * @param outputFilename - Target filename (default: AGENTS.md)
 * @returns EmittedFile ready for writing
 */
export function processMemoryPromptBundle(
  bundle: InputBundle,
  outputFilename: string = 'AGENTS.md',
): EmittedFile {
  const emittedFile: EmittedFile = {
    type: 'asset',
    fileName: outputFilename,
    source: bundle.content,
    targetType: 'workspace',
    inputType: InputType.MEMORY_PROMPT,
  }

  // Only set frontMatter if it exists
  if (bundle.frontMatter) {
    emittedFile.frontMatter = bundle.frontMatter
  }

  return emittedFile
}

/**
 * Get the workspace path from an InputBundle
 * Extracts the workspace directory from the bundle's path
 *
 * @param bundle - InputBundle containing the file path
 * @param ctx - Plugin context for path utilities
 * @returns Workspace directory path
 */
export function getWorkspaceFromBundle(bundle: InputBundle, ctx: PluginContext): string {
  // The bundle path is relative to the workspace
  // For AGENTS.md files, the workspace is the parent directory
  const dir = ctx.path.dirname(bundle.path)
  return dir === '.' ? '' : dir
}

/**
 * Filter InputBundles to only include MemoryPrompt types
 *
 * @param bundles - Array of InputBundles
 * @returns Filtered array containing only MemoryPrompt bundles
 */
export function filterMemoryPromptBundles(bundles: InputBundle[]): InputBundle[] {
  return bundles.filter((bundle) => bundle.type === InputType.MEMORY_PROMPT)
}

/**
 * AgentsMdPlugin - Base output plugin for AGENTS.md files
 *
 * Handles MemoryPrompt (AGENTS.md) input type and maps them to workspace root.
 * This plugin serves as a base for other plugins that need to handle AGENTS.md files.
 *
 * @example
 * ```typescript
 * // Basic usage
 * const plugin = createAgentsMdPlugin()
 *
 * // With custom options
 * const plugin = createAgentsMdPlugin({
 *   outputFilename: 'AGENTS.md',
 *   cleanTarget: false,
 * })
 * ```
 *
 * @see Requirements 35.1, 35.2
 */
export function createAgentsMdPlugin(options: AgentsMdPluginOptions = {}): OutputPlugin {
  const {
    cleanTarget = false,
    outputFilename = 'AGENTS.md',
    emitFiles = true,
  } = options

  // Track processed bundles for reporting
  let processedBundles: InputBundle[] = []

  return {
    name: 'agentsMd',
    priority: 100,

    // Handle only MemoryPrompt input type (Requirement 35.1)
    inputTypes: [InputType.MEMORY_PROMPT],

    // Output configuration (Requirement 35.2)
    outputs: DEFAULT_OUTPUTS,

    /**
     * Build start hook - initialize plugin state
     */
    buildStart(ctx: PluginContext, _params: BuildStartParams): void {
      processedBundles = []
      ctx.log.debug('AgentsMdPlugin: Starting build')
    },

    /**
     * Generate bundle hook - process MemoryPrompt bundles
     * Collects all AGENTS.md files and prepares them for emission
     *
     * @see Requirement 35.1
     */
    async generateBundle(ctx: PluginContext, _params: GenerateBundleParams): Promise<void> {
      // Get MemoryPrompt bundles from context
      const bundles = ctx.getInputBundles(InputType.MEMORY_PROMPT)

      if (bundles.length === 0) {
        ctx.log.debug('AgentsMdPlugin: No MemoryPrompt bundles found')
        return
      }

      ctx.log.debug(`AgentsMdPlugin: Processing ${bundles.length} MemoryPrompt bundle(s)`)

      // Process each bundle
      for (const bundle of bundles) {
        const emittedFile = processMemoryPromptBundle(bundle, outputFilename)

        if (emitFiles) {
          ctx.emitFile(emittedFile)
        }

        processedBundles.push(bundle)
      }

      // Store processed bundles in registry for child plugins
      ctx.registry.set('agentsMd', 'processedBundles', processedBundles)
      ctx.registry.set('agentsMd', 'outputFilename', outputFilename)
    },

    /**
     * Write bundle hook - write AGENTS.md files to workspace roots
     *
     * @see Requirement 35.2
     */
    async writeBundle(ctx: PluginContext, params: WriteBundleParams): Promise<void> {
      if (!emitFiles) {
        ctx.log.debug('AgentsMdPlugin: File emission disabled')
        return
      }

      const { files } = params

      // Filter to only our emitted files
      const agentsFiles = files.filter(
        (f) => f.inputType === InputType.MEMORY_PROMPT && f.fileName === outputFilename,
      )

      if (agentsFiles.length === 0) {
        ctx.log.debug('AgentsMdPlugin: No files to write')
        return
      }

      // Clean target if configured
      if (cleanTarget) {
        ctx.log.debug('AgentsMdPlugin: Cleaning target directories')
      }

      let written = 0
      for (const file of agentsFiles) {
        try {
          // Get the workspace path from the corresponding bundle
          const bundle = processedBundles.find(
            (b) => b.content === file.source,
          )

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
            written++

            ctx.log.debug(`AgentsMdPlugin: Wrote ${targetPath}`)
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          ctx.log.error(`AgentsMdPlugin: Failed to write ${file.fileName}: ${errorMsg}`)
        }
      }

      if (written > 0) {
        ctx.log.info(`AgentsMdPlugin: Wrote ${written} AGENTS.md file(s)`)
      }
    },
  }
}

export default createAgentsMdPlugin
