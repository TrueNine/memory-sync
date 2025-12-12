/**
 * FactoryDroidCLIPlugin - CLI output plugin for Factory Droid AI assistant
 * Extends ClaudeCodeCLIPlugin with different output paths (.factory/)
 *
 * @see Requirements 32.6
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
  ResolvedOutputPaths,
  WriteBundleParams,
} from '@/core/types'
import { InputType } from '@/core/types'
import {
  filterHandledBundles,
  getOutputFilename,
  getOutputSubdirectory,
  processInputBundle,
} from './ClaudeCodeCLIPlugin'

/**
 * Options for FactoryDroidCLIPlugin
 */
export interface FactoryDroidCLIPluginOptions {
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
   * Whether to emit to global config directory (~/.factory/)
   * Default: true
   */
  emitGlobal?: boolean

  /**
   * Whether to emit to workspace directory (.factory/)
   * Default: true
   */
  emitWorkspace?: boolean

  /**
   * Custom global config directory path (for testing)
   * Default: ~/.factory/
   */
  globalConfigPath?: string

  /**
   * Custom workspace config directory path (for testing)
   * Default: .factory/
   */
  workspaceConfigPath?: string
}

/**
 * Default plugin outputs for FactoryDroidCLIPlugin
 * Emits to both global (~/.factory/) and workspace (.factory/) directories
 *
 * @see Requirement 32.6
 */
const DEFAULT_OUTPUTS: PluginOutput[] = [
  {
    id: 'global-config',
    category: 'cli',
    tool: 'factory',
    targetType: 'globalConfig',
    path: '.factory',
    enabled: true,
  },
  {
    id: 'workspace-config',
    category: 'cli',
    tool: 'factory',
    targetType: 'workspace',
    path: '.factory',
    enabled: true,
  },
]

/**
 * Input types handled by FactoryDroidCLIPlugin
 * Same as ClaudeCodeCLIPlugin - handles GlobalPrompt, SubAgent, FastCommand, Skill
 * @see Requirement 32.6
 */
const HANDLED_INPUT_TYPES: InputType[] = [
  InputType.GLOBAL_PROMPT,
  InputType.SUB_AGENT,
  InputType.FAST_COMMAND,
  InputType.SKILL,
]

/**
 * FactoryDroidCLIPlugin - CLI output plugin for Factory Droid
 *
 * Extends ClaudeCodeCLIPlugin functionality with different output paths (.factory/).
 * Handles GlobalPrompt, SubAgent, FastCommand, and Skill input types.
 * Emits files to both ~/.factory/ (global) and .factory/ (workspace) directories.
 *
 * Directory structure:
 * - GlobalPrompt: .factory/CLAUDE.md (or similar)
 * - SubAgent: .factory/agents/
 * - FastCommand: .factory/commands/
 * - Skill: .factory/skills/
 *
 * @example
 * ```typescript
 * // Basic usage
 * const plugin = createFactoryDroidCLIPlugin()
 *
 * // With custom options
 * const plugin = createFactoryDroidCLIPlugin({
 *   emitGlobal: true,
 *   emitWorkspace: true,
 *   cleanTarget: false,
 * })
 * ```
 *
 * @see Requirements 32.6
 */
export function createFactoryDroidCLIPlugin(
  options: FactoryDroidCLIPluginOptions = {},
): OutputPlugin {
  const {
    cleanTarget = false,
    emitFiles = true,
    emitGlobal = true,
    emitWorkspace = true,
    // Note: globalConfigPath handled in writeBundle
    globalConfigPath,
    workspaceConfigPath = '.factory',
  } = options

  // Track processed bundles for reporting
  let processedBundles: InputBundle[] = []
  let globalEmittedFiles: EmittedFile[] = []
  let workspaceEmittedFiles: EmittedFile[] = []

  // Resolved output paths (populated in buildStart)
  let resolvedWorkspacePath: string = ''
  let resolvedGlobalPath: string = ''

  return {
    name: 'factoryDroidCli',
    priority: 100,

    // Extends ClaudeCodeCLIPlugin (Requirement 32.6)
    extends: 'claudeCodeCli',

    // Handle same input types as ClaudeCodeCLIPlugin (Requirement 32.6)
    inputTypes: HANDLED_INPUT_TYPES,

    // Output configuration with .factory/ paths (Requirement 32.6)
    outputs: DEFAULT_OUTPUTS,

    /**
     * Build start hook - initialize plugin state and resolve output paths
     */
    buildStart(ctx: PluginContext, _params: BuildStartParams): void {
      processedBundles = []
      globalEmittedFiles = []
      workspaceEmittedFiles = []

      // Resolve output paths using context helper
      const resolvedPaths: ResolvedOutputPaths = ctx.resolveOutputPaths(DEFAULT_OUTPUTS)
      resolvedWorkspacePath = workspaceConfigPath
        ? ctx.paths.resolve(workspaceConfigPath)
        : (resolvedPaths.workspacePath ?? ctx.paths.resolve('.factory'))
      resolvedGlobalPath = globalConfigPath
        ?? resolvedPaths.globalConfigPath
        ?? ctx.path.join(ctx.paths.userHome, '.factory')

      ctx.log.debug(`FactoryDroidCLIPlugin: Starting build`)
      ctx.log.debug(`FactoryDroidCLIPlugin: Workspace path: ${resolvedWorkspacePath}`)
      ctx.log.debug(`FactoryDroidCLIPlugin: Global path: ${resolvedGlobalPath}`)
    },

    /**
     * Generate bundle hook - process input bundles
     * Collects all handled input types and prepares them for emission
     *
     * @see Requirement 32.6
     */
    async generateBundle(ctx: PluginContext, _params: GenerateBundleParams): Promise<void> {
      // Get all bundles for handled input types
      const allBundles: InputBundle[] = []

      for (const inputType of HANDLED_INPUT_TYPES) {
        const bundles = ctx.getInputBundles(inputType)
        allBundles.push(...bundles)
      }

      if (allBundles.length === 0) {
        ctx.log.debug('FactoryDroidCLIPlugin: No input bundles found')
        return
      }

      ctx.log.debug(`FactoryDroidCLIPlugin: Processing ${allBundles.length} input bundle(s)`)

      // Process each bundle for both global and workspace targets
      for (const bundle of allBundles) {
        // Emit to global config if enabled
        if (emitGlobal) {
          const globalFile = processInputBundle(bundle, 'globalConfig', ctx)
          globalEmittedFiles.push(globalFile)

          if (emitFiles) {
            ctx.emitFile(globalFile)
          }
        }

        // Emit to workspace if enabled
        if (emitWorkspace) {
          const workspaceFile = processInputBundle(bundle, 'workspace', ctx)
          workspaceEmittedFiles.push(workspaceFile)

          if (emitFiles) {
            ctx.emitFile(workspaceFile)
          }
        }

        processedBundles.push(bundle)
      }

      // Store processed data in registry for potential child plugins
      ctx.registry.set('factoryDroidCli', 'processedBundles', processedBundles)
      ctx.registry.set('factoryDroidCli', 'globalEmittedFiles', globalEmittedFiles)
      ctx.registry.set('factoryDroidCli', 'workspaceEmittedFiles', workspaceEmittedFiles)
    },

    /**
     * Write bundle hook - write files to global and workspace directories
     *
     * @see Requirement 32.6
     */
    async writeBundle(ctx: PluginContext, params: WriteBundleParams): Promise<void> {
      if (!emitFiles) {
        ctx.log.debug('FactoryDroidCLIPlugin: File emission disabled')
        return
      }

      const { files } = params

      // Filter to only our emitted files
      const droidFiles = files.filter(
        (f) => HANDLED_INPUT_TYPES.includes(f.inputType as InputType),
      )

      if (droidFiles.length === 0) {
        ctx.log.debug('FactoryDroidCLIPlugin: No files to write')
        return
      }

      // Clean target directories if configured
      if (cleanTarget) {
        ctx.log.debug('FactoryDroidCLIPlugin: Cleaning target directories')

        if (emitGlobal) {
          try {
            await ctx.fs.cleanDir(resolvedGlobalPath)
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            ctx.log.warn(`FactoryDroidCLIPlugin: Failed to clean global directory: ${errorMsg}`)
          }
        }

        if (emitWorkspace) {
          try {
            await ctx.fs.cleanDir(resolvedWorkspacePath)
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            ctx.log.warn(`FactoryDroidCLIPlugin: Failed to clean workspace directory: ${errorMsg}`)
          }
        }
      }

      let globalWritten = 0
      let workspaceWritten = 0

      for (const file of droidFiles) {
        try {
          if (file.targetType === 'globalConfig' && emitGlobal) {
            // Write to global config directory (~/.factory/)
            const targetPath = ctx.path.join(resolvedGlobalPath, file.fileName)
            const targetDir = ctx.path.dirname(targetPath)

            await ctx.fs.ensureDir(targetDir)
            await ctx.fs.writeFile(targetPath, file.source)
            globalWritten++

            ctx.log.debug(`FactoryDroidCLIPlugin: Wrote global ${targetPath}`)
          } else if (file.targetType === 'workspace' && emitWorkspace) {
            // Write to workspace directory (.factory/)
            const targetPath = ctx.path.join(resolvedWorkspacePath, file.fileName)
            const targetDir = ctx.path.dirname(targetPath)

            await ctx.fs.ensureDir(targetDir)
            await ctx.fs.writeFile(targetPath, file.source)
            workspaceWritten++

            ctx.log.debug(`FactoryDroidCLIPlugin: Wrote workspace ${targetPath}`)
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          ctx.log.error(`FactoryDroidCLIPlugin: Failed to write ${file.fileName}: ${errorMsg}`)
        }
      }

      const total = globalWritten + workspaceWritten
      if (total > 0) {
        ctx.log.info(
          `FactoryDroidCLIPlugin: Wrote ${total} file(s) (${globalWritten} global, ${workspaceWritten} workspace)`,
        )
      }
    },
  }
}

// Re-export helper functions from ClaudeCodeCLIPlugin for consistency
export {
  filterHandledBundles,
  getOutputFilename,
  getOutputSubdirectory,
  processInputBundle,
}
