/**
 * ClaudeCodeCLIPlugin - CLI output plugin for Claude Code AI assistant
 * Handles GlobalPrompt, SubAgent, FastCommand, and Skill input types
 * Emits to both ~/.claude/ (global) and .claude/ (workspace)
 *
 * @see Requirements 32.1, 32.2
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
import { InputType } from '@/core/types'

/**
 * Options for ClaudeCodeCLIPlugin
 */
export interface ClaudeCodeCLIPluginOptions {
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
   * Whether to emit to global config directory (~/.claude/)
   * Default: true
   */
  emitGlobal?: boolean

  /**
   * Whether to emit to workspace directory (.claude/)
   * Default: true
   */
  emitWorkspace?: boolean

  /**
   * Custom global config directory path (for testing)
   * Default: ~/.claude/
   */
  globalConfigPath?: string

  /**
   * Custom workspace config directory path (for testing)
   * Default: .claude/
   */
  workspaceConfigPath?: string
}

/**
 * Default plugin outputs for ClaudeCodeCLIPlugin
 * Emits to both global (~/.claude/) and workspace (.claude/) directories
 *
 * @see Requirement 32.2
 */
const DEFAULT_OUTPUTS: PluginOutput[] = [
  {
    id: 'global-config',
    category: 'cli',
    tool: 'claude',
    targetType: 'globalConfig',
    path: '$USER_HOME/.claude',
    enabled: true,
  },
  {
    id: 'workspace-config',
    category: 'cli',
    tool: 'claude',
    targetType: 'workspace',
    path: '.claude',
    enabled: true,
  },
]

/**
 * Input types handled by ClaudeCodeCLIPlugin
 * @see Requirement 32.1
 */
const HANDLED_INPUT_TYPES: InputType[] = [
  InputType.GLOBAL_PROMPT,
  InputType.SUB_AGENT,
  InputType.FAST_COMMAND,
  InputType.SKILL,
]

/**
 * Get the output subdirectory for a given input type
 * Maps input types to Claude Code directory structure
 *
 * @param inputType - Input type to map
 * @returns Subdirectory name for the input type
 */
export function getOutputSubdirectory(inputType: InputType): string {
  switch (inputType) {
    case InputType.GLOBAL_PROMPT:
      // GlobalPrompt goes to root directory (CLAUDE.md)
      return ''
    case InputType.SUB_AGENT:
      return 'agents'
    case InputType.FAST_COMMAND:
      return 'commands'
    case InputType.SKILL:
      return 'skills'
    case InputType.MEMORY_PROMPT:
    case InputType.CONFIG_FILE:
      // These types are not handled by this plugin
      return ''
  }
}

/**
 * Get the output filename for a given input type
 * GlobalPrompt is renamed to CLAUDE.md for Claude Code compatibility
 *
 * @param inputType - Input type
 * @param originalFilename - Original filename from the bundle
 * @returns Output filename
 */
export function getOutputFilenameForType(inputType: InputType, originalFilename: string): string {
  if (inputType === InputType.GLOBAL_PROMPT) {
    // GlobalPrompt (GLOBAL.md) is renamed to CLAUDE.md for Claude Code
    return 'CLAUDE.md'
  }
  return originalFilename
}

/**
 * Get the output filename for an InputBundle
 * GlobalPrompt is renamed to CLAUDE.md, others preserve original filename
 *
 * @param bundle - InputBundle to get filename from
 * @param ctx - Plugin context
 * @returns Output filename
 */
export function getOutputFilename(bundle: InputBundle, ctx: PluginContext): string {
  const originalFilename = ctx.path.basename(bundle.path)
  return getOutputFilenameForType(bundle.type, originalFilename)
}

/**
 * Process an InputBundle and prepare it for emission
 *
 * @param bundle - InputBundle to process
 * @param targetType - Target type (globalConfig or workspace)
 * @param ctx
 * @returns EmittedFile ready for writing
 */
export function processInputBundle(
  bundle: InputBundle,
  targetType: 'globalConfig' | 'workspace',
  ctx: PluginContext,
): EmittedFile {
  const subdir = getOutputSubdirectory(bundle.type)
  const filename = getOutputFilename(bundle, ctx)
  const outputPath = subdir ? ctx.path.join(subdir, filename) : filename

  const emittedFile: EmittedFile = {
    type: 'asset',
    fileName: outputPath,
    source: bundle.content,
    targetType,
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
 * ClaudeCodeCLIPlugin - CLI output plugin for Claude Code
 *
 * Handles GlobalPrompt, SubAgent, FastCommand, and Skill input types.
 * Emits files to both ~/.claude/ (global) and .claude/ (workspace) directories.
 *
 * Directory structure:
 * - GlobalPrompt: .claude/CLAUDE.md (or similar)
 * - SubAgent: .claude/agents/
 * - FastCommand: .claude/commands/
 * - Skill: .claude/skills/
 *
 * @example
 * ```typescript
 * // Basic usage
 * const plugin = createClaudeCodeCLIPlugin()
 *
 * // With custom options
 * const plugin = createClaudeCodeCLIPlugin({
 *   emitGlobal: true,
 *   emitWorkspace: true,
 *   cleanTarget: false,
 * })
 * ```
 *
 * @see Requirements 32.1, 32.2
 */
export function createClaudeCodeCLIPlugin(
  options: ClaudeCodeCLIPluginOptions = {},
): OutputPlugin {
  const {
    cleanTarget = false,
    emitFiles = true,
    emitGlobal = true,
    emitWorkspace = true,
    // Note: globalConfigPath default is handled in writeBundle
    globalConfigPath,
    workspaceConfigPath = '.claude',
  } = options

  // Track processed bundles for reporting
  let processedBundles: InputBundle[] = []
  let globalEmittedFiles: EmittedFile[] = []
  let workspaceEmittedFiles: EmittedFile[] = []

  // Resolved output paths (populated in buildStart)
  let resolvedWorkspacePath: string = ''
  let resolvedGlobalPath: string = ''

  return {
    name: 'claudeCodeCli',
    priority: 100,

    // Handle GlobalPrompt, SubAgent, FastCommand, Skill input types (Requirement 32.1)
    inputTypes: HANDLED_INPUT_TYPES,

    // Output configuration (Requirement 32.2)
    outputs: DEFAULT_OUTPUTS,

    /**
     * Build start hook - initialize plugin state and resolve output paths
     */
    buildStart(ctx: PluginContext, _params: BuildStartParams): void {
      processedBundles = []
      globalEmittedFiles = []
      workspaceEmittedFiles = []

      // Resolve output paths using context helper
      const resolvedPaths = ctx.resolveOutputPaths(DEFAULT_OUTPUTS)
      resolvedWorkspacePath = workspaceConfigPath
        ? ctx.paths.resolve(workspaceConfigPath)
        : (resolvedPaths.workspacePath ?? ctx.paths.resolve('.claude'))
      resolvedGlobalPath = globalConfigPath
        ?? resolvedPaths.globalConfigPath
        ?? ctx.path.join(ctx.paths.userHome, '.claude')

      ctx.log.debug(`ClaudeCodeCLIPlugin: Starting build`)
      ctx.log.debug(`ClaudeCodeCLIPlugin: Workspace path: ${resolvedWorkspacePath}`)
      ctx.log.debug(`ClaudeCodeCLIPlugin: Global path: ${resolvedGlobalPath}`)
    },

    /**
     * Generate bundle hook - process input bundles
     * Collects all handled input types and prepares them for emission
     *
     * @see Requirements 32.1, 32.2
     */
    async generateBundle(ctx: PluginContext, _params: GenerateBundleParams): Promise<void> {
      // Get all bundles for handled input types
      const allBundles: InputBundle[] = []

      for (const inputType of HANDLED_INPUT_TYPES) {
        const bundles = ctx.getInputBundles(inputType)
        allBundles.push(...bundles)
      }

      if (allBundles.length === 0) {
        ctx.log.debug('ClaudeCodeCLIPlugin: No input bundles found')
        return
      }

      ctx.log.debug(`ClaudeCodeCLIPlugin: Processing ${allBundles.length} input bundle(s)`)

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

      // Store processed data in registry for child plugins
      ctx.registry.set('claudeCodeCli', 'processedBundles', processedBundles)
      ctx.registry.set('claudeCodeCli', 'globalEmittedFiles', globalEmittedFiles)
      ctx.registry.set('claudeCodeCli', 'workspaceEmittedFiles', workspaceEmittedFiles)
    },

    /**
     * Write bundle hook - write files to global and workspace directories
     *
     * @see Requirement 32.2
     */
    async writeBundle(ctx: PluginContext, params: WriteBundleParams): Promise<void> {
      if (!emitFiles) {
        ctx.log.debug('ClaudeCodeCLIPlugin: File emission disabled')
        return
      }

      const { files } = params

      // Filter to only our emitted files
      const claudeFiles = files.filter(
        (f) => HANDLED_INPUT_TYPES.includes(f.inputType as InputType),
      )

      if (claudeFiles.length === 0) {
        ctx.log.debug('ClaudeCodeCLIPlugin: No files to write')
        return
      }

      // Clean target directories if configured
      if (cleanTarget) {
        ctx.log.debug('ClaudeCodeCLIPlugin: Cleaning target directories')

        if (emitGlobal) {
          try {
            await ctx.fs.cleanDir(resolvedGlobalPath)
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            ctx.log.warn(`ClaudeCodeCLIPlugin: Failed to clean global directory: ${errorMsg}`)
          }
        }

        if (emitWorkspace) {
          try {
            await ctx.fs.cleanDir(resolvedWorkspacePath)
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            ctx.log.warn(`ClaudeCodeCLIPlugin: Failed to clean workspace directory: ${errorMsg}`)
          }
        }
      }

      let globalWritten = 0
      let workspaceWritten = 0

      for (const file of claudeFiles) {
        try {
          if (file.targetType === 'globalConfig' && emitGlobal) {
            // Write to global config directory (~/.claude/)
            const targetPath = ctx.path.join(resolvedGlobalPath, file.fileName)
            const targetDir = ctx.path.dirname(targetPath)

            await ctx.fs.ensureDir(targetDir)
            await ctx.fs.writeFile(targetPath, file.source)
            globalWritten++

            ctx.log.debug(`ClaudeCodeCLIPlugin: Wrote global ${targetPath}`)
          } else if (file.targetType === 'workspace' && emitWorkspace) {
            // Write to workspace directory (.claude/)
            const targetPath = ctx.path.join(resolvedWorkspacePath, file.fileName)
            const targetDir = ctx.path.dirname(targetPath)

            await ctx.fs.ensureDir(targetDir)
            await ctx.fs.writeFile(targetPath, file.source)
            workspaceWritten++

            ctx.log.debug(`ClaudeCodeCLIPlugin: Wrote workspace ${targetPath}`)
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error)
          ctx.log.error(`ClaudeCodeCLIPlugin: Failed to write ${file.fileName}: ${errorMsg}`)
        }
      }

      const total = globalWritten + workspaceWritten
      if (total > 0) {
        ctx.log.info(
          `ClaudeCodeCLIPlugin: Wrote ${total} file(s) (${globalWritten} global, ${workspaceWritten} workspace)`,
        )
      }
    },
  }
}
