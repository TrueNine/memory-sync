/**
 * CodexCLIPlugin - CLI output plugin for Codex AI assistant
 * Extends AgentsMdPlugin to handle GlobalPrompt and FastCommand input types
 * FastCommand outputs to global config directory only
 *
 * @see Requirements 32.5
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

/**
 * Options for CodexCLIPlugin
 */
export interface CodexCLIPluginOptions {
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
   * Custom global config directory path (for testing)
   * Default: ~/.codex/
   */
  globalConfigPath?: string
}

/**
 * Default plugin outputs for CodexCLIPlugin
 * Emits to global config directory ($USER_HOME/.codex/) only
 *
 * @see Requirement 32.5
 */
const DEFAULT_OUTPUTS: PluginOutput[] = [
  {
    id: 'global-config',
    category: 'cli',
    tool: 'codex',
    targetType: 'globalConfig',
    path: '$USER_HOME/.codex',
    enabled: true,
  },
]

/**
 * Input types handled by CodexCLIPlugin
 * @see Requirement 32.5
 */
const HANDLED_INPUT_TYPES: InputType[] = [
  InputType.GLOBAL_PROMPT,
  InputType.FAST_COMMAND,
]

/**
 * Get the output subdirectory for a given input type
 * Maps input types to Codex directory structure
 *
 * @param inputType - Input type to map
 * @returns Subdirectory name for the input type
 */
export function getOutputSubdirectory(inputType: InputType): string {
  switch (inputType) {
    case InputType.GLOBAL_PROMPT:
      return ''
    case InputType.FAST_COMMAND:
      return 'commands'
    case InputType.MEMORY_PROMPT:
    case InputType.SUB_AGENT:
    case InputType.SKILL:
    case InputType.CONFIG_FILE:
      // These types are not handled by this plugin
      return ''
  }
}

/**
 * Get the output filename for an InputBundle
 * Preserves original filename from the bundle path
 *
 * @param bundle - InputBundle to get filename from
 * @returns Output filename
 */
export function getOutputFilename(bundle: InputBundle, ctx: PluginContext): string {
  return ctx.path.basename(bundle.path)
}

/**
 * Process an InputBundle and prepare it for emission to global config
 *
 * @param bundle - InputBundle to process
 * @returns EmittedFile ready for writing
 */
export function processInputBundle(bundle: InputBundle, ctx: PluginContext): EmittedFile {
  const subdir = getOutputSubdirectory(bundle.type)
  const filename = getOutputFilename(bundle, ctx)
  const outputPath = subdir ? ctx.path.join(subdir, filename) : filename

  const emittedFile: EmittedFile = {
    type: 'asset',
    fileName: outputPath,
    source: bundle.content,
    targetType: 'globalConfig',
    inputType: bundle.type,
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
export function filterHandledBundles(bundles: InputBundle[]): InputBundle[] {
  return bundles.filter((bundle) => HANDLED_INPUT_TYPES.includes(bundle.type))
}

/**
 * CodexCLIPlugin - CLI output plugin for Codex AI assistant
 *
 * Extends AgentsMdPlugin functionality to handle GlobalPrompt and FastCommand input types.
 * FastCommand files are output to global config directory (~/.codex/) only.
 *
 * This plugin inherits MemoryPrompt handling from AgentsMdPlugin and adds
 * GlobalPrompt and FastCommand handling for global configuration files.
 *
 * Directory structure:
 * - GlobalPrompt: ~/.codex/ (root)
 * - FastCommand: ~/.codex/commands/
 *
 * @example
 * ```typescript
 * // Basic usage
 * const plugin = createCodexCLIPlugin()
 *
 * // With custom options
 * const plugin = createCodexCLIPlugin({
 *   globalConfigPath: '$USER_HOME/.codex/',
 *   cleanTarget: false,
 * })
 *
 * // Register global prompt file
 * // The plugin will automatically register $USER_HOME/.codex/AGENTS.md
 * // as a global prompt file for Codex
 * ```
 *
 * @see Requirements 32.5
 */
export function createCodexCLIPlugin(options: CodexCLIPluginOptions = {}): OutputPlugin {
  const {
    cleanTarget = false,
    emitFiles = true,
    // Note: globalConfigPath handled in writeBundle
    globalConfigPath,
  } = options

  // Track processed bundles for reporting
  let globalPromptBundles: InputBundle[] = []
  let fastCommandBundles: InputBundle[] = []
  let globalEmittedFiles: EmittedFile[] = []

  return {
    name: 'codexCli',
    priority: 100,

    // Extends AgentsMdPlugin (Requirement 32.5)
    extends: 'agentsMd',

    // Handle GlobalPrompt and FastCommand input types (Requirement 32.5)
    inputTypes: HANDLED_INPUT_TYPES,

    // Output configuration - global only (Requirement 32.5)
    outputs: DEFAULT_OUTPUTS,

    /**
     * Build start hook - initialize plugin state
     */
    buildStart(ctx: PluginContext, _params: BuildStartParams): void {
      globalPromptBundles = []
      fastCommandBundles = []
      globalEmittedFiles = []
      ctx.log.debug('CodexCLIPlugin: Starting build')
    },

    /**
     * Generate bundle hook - process GlobalPrompt and FastCommand bundles
     * Collects all handled input types and prepares them for emission to global config
     *
     * @see Requirement 32.5
     */
    async generateBundle(ctx: PluginContext, _params: GenerateBundleParams): Promise<void> {
      // Process GlobalPrompt bundles
      const globalBundles = ctx.getInputBundles(InputType.GLOBAL_PROMPT)

      if (globalBundles.length > 0) {
        ctx.log.debug(`CodexCLIPlugin: Processing ${globalBundles.length} GlobalPrompt bundle(s)`)

        for (const bundle of globalBundles) {
          const emittedFile = processInputBundle(bundle, ctx)

          if (emitFiles) {
            ctx.emitFile(emittedFile)
            globalEmittedFiles.push(emittedFile)
          }

          globalPromptBundles.push(bundle)
        }
      }

      // Process FastCommand bundles (Requirement 32.5 - output to global only)
      const commandBundles = ctx.getInputBundles(InputType.FAST_COMMAND)

      if (commandBundles.length > 0) {
        ctx.log.debug(`CodexCLIPlugin: Processing ${commandBundles.length} FastCommand bundle(s)`)

        for (const bundle of commandBundles) {
          const emittedFile = processInputBundle(bundle, ctx)

          if (emitFiles) {
            ctx.emitFile(emittedFile)
            globalEmittedFiles.push(emittedFile)
          }

          fastCommandBundles.push(bundle)
        }
      }

      // Store processed data in registry for potential child plugins
      ctx.registry.set('codexCli', 'globalPromptBundles', globalPromptBundles)
      ctx.registry.set('codexCli', 'fastCommandBundles', fastCommandBundles)
      ctx.registry.set('codexCli', 'globalEmittedFiles', globalEmittedFiles)
    },

    /**
     * Write bundle hook - write files to global config directory ($USER_HOME/.codex/)
     *
     * @see Requirement 32.5
     */
    async writeBundle(ctx: PluginContext, params: WriteBundleParams): Promise<void> {
      if (!emitFiles) {
        ctx.log.debug('CodexCLIPlugin: File emission disabled')
        return
      }

      const { files } = params

      // Filter to only our emitted files (GlobalPrompt and FastCommand)
      const codexFiles = files.filter(
        (f) =>
          f.targetType === 'globalConfig'
          && (f.inputType === InputType.GLOBAL_PROMPT || f.inputType === InputType.FAST_COMMAND),
      )

      if (codexFiles.length === 0) {
        ctx.log.debug('CodexCLIPlugin: No files to write')
        return
      }

      // Clean target directory if configured
      if (cleanTarget) {
        ctx.log.debug('CodexCLIPlugin: Cleaning target directory')

        try {
          const resolvedGlobalPath = globalConfigPath ?? (os.homedir() + (os.platform() === 'win32' ? '\\.codex' : '/.codex'))
          await ctx.fs.cleanDir(resolvedGlobalPath)
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          ctx.log.warn(`CodexCLIPlugin: Failed to clean global directory: ${errorMsg}`)
        }
      }

      let globalWritten = 0

      for (const file of codexFiles) {
        try {
          // Write to global config directory ($USER_HOME/.codex/)
          const resolvedGlobalPath = globalConfigPath ?? (os.homedir() + (os.platform() === 'win32' ? '\\.codex' : '/.codex'))
          const targetPath = ctx.path.join(resolvedGlobalPath, file.fileName)
          const targetDir = ctx.path.dirname(targetPath)

          await ctx.fs.ensureDir(targetDir)
          await ctx.fs.writeFile(targetPath, file.source)
          globalWritten++

          ctx.log.debug(`CodexCLIPlugin: Wrote global ${targetPath}`)
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          ctx.log.error(`CodexCLIPlugin: Failed to write ${file.fileName}: ${errorMsg}`)
        }
      }

      // Register global prompt file ($USER_HOME/.codex/AGENTS.md)
      try {
        const resolvedGlobalPath = globalConfigPath ?? (os.homedir() + (os.platform() === 'win32' ? '\\.codex' : '/.codex'))
        const globalPromptPath = ctx.path.join(resolvedGlobalPath, 'AGENTS.md')
        const globalPromptExists = await ctx.fs.exists(globalPromptPath)
        
        if (globalPromptExists) {
          ctx.log.info(`CodexCLIPlugin: Registered global prompt file at ${globalPromptPath}`)
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        ctx.log.warn(`CodexCLIPlugin: Failed to register global prompt file: ${errorMsg}`)
      }

      if (globalWritten > 0) {
        ctx.log.info(`CodexCLIPlugin: Wrote ${globalWritten} file(s) to global config`)
      }
    },
  }
}

export default createCodexCLIPlugin
