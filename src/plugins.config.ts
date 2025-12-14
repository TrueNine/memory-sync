/**
 * Default plugin configuration for the aindex toolchain
 * This file registers all built-in plugins with their default options
 * Feature: plugin-architecture
 *
 * Plugin execution order is determined by priority (lower = earlier):
 * - Transform plugins (10-20): FrontMatter, BlankLineCleaner
 * - Ref project plugin (30): RefProjectPlugin
 * - Export plugins (50-80): Kiro, Qoder, Claude, Gemini, Skills, GlobalPrompt
 * - Workflow plugin (75): WorkflowPlugin
 *
 * @see Requirements 22.5, 22.6, 36.5, 10.2
 */

import type {
  InputPlugin,
  OutputPlugin,
  PluginConfig,
} from './core/types'
import { PathBuilder, USER_PROJECTS_DIR } from '@/constants'
import {
  createAgentsMdPlugin,
  createAindexInputPlugin,
  createAntigravityIDEPlugin,
  createClaudeCodeCLIPlugin,
  createCodeBuddyIDEPlugin,
  createCodexCLIPlugin,
  createCursorIDEPlugin,
  createEditorconfigConfigPlugin,
  createFactoryDroidCLIPlugin,
  createGeminiCLIPlugin,
  createJetBrainsIDEConfigPlugin,
  createKiroIDEPlugin,
  createQoderIDEPlugin,
  createRefInputPlugin,
  createVSCodeIDEConfigPlugin,
  createWindsurfIDEPlugin,
  createWorkspaceInputPlugin,
} from './plugins'

/**
 * Default aindex project path builder
 * Used as default configuration for input plugins
 */
const defaultAindexPaths = PathBuilder.forProject('aindex')

/**
 * Default plugin options for aindex project
 */
export const defaultPluginOptions = {
  /**
   * Default aindex dist directory
   */
  aindexDistDir: defaultAindexPaths.dist(),

  /**
   * Default ref directory
   */
  refDir: defaultAindexPaths.ref(),

  /**
   * Default exclude patterns for input scanning
   */
  excludePatterns: ['ref/*/dist'] as string[],

  /**
   * Default workspace directory
   */
  workspaceDir: USER_PROJECTS_DIR,
} as const

// ============================================================================
// Input Plugins
// ============================================================================

/**
 * Create input plugins with custom options
 * @param options - Custom options to override defaults
 */
export function createInputPlugins(options?: Partial<typeof defaultPluginOptions>): InputPlugin[] {
  const opts = { ...defaultPluginOptions, ...options }

  return [
    createWorkspaceInputPlugin(),
    createRefInputPlugin({
      refDir: opts.refDir,
      excludePatterns: opts.excludePatterns,
    }),
    createAindexInputPlugin({
      distDir: opts.aindexDistDir,
      excludePatterns: opts.excludePatterns,
    }),
  ]
}

/**
 * Input plugins for Phase 1 execution (with default options)
 * These plugins scan sources and populate context with InputBundles
 *
 * @see Requirements 36.1, 36.2, 36.3, 36.5
 */
export const inputPlugins: InputPlugin[] = createInputPlugins()

/**
 * Output plugins for Phase 2 execution
 * These plugins process InputBundles and emit files to targets
 *
 * @see Requirements 22.5, 22.6
 */
export const outputPlugins: OutputPlugin[] = [
  createAgentsMdPlugin(),
  createClaudeCodeCLIPlugin(),
  createGeminiCLIPlugin(),
  createCodexCLIPlugin(),
  createFactoryDroidCLIPlugin(),
  createKiroIDEPlugin(),
  createQoderIDEPlugin(),
  createWindsurfIDEPlugin(),
  createAntigravityIDEPlugin(),
  createCursorIDEPlugin(),
  createCodeBuddyIDEPlugin(),
  createJetBrainsIDEConfigPlugin(),
  createVSCodeIDEConfigPlugin(),
  createEditorconfigConfigPlugin(),
]

/**
 * Default plugin configuration (empty - legacy plugins removed)
 * New architecture uses inputPlugins and outputPlugins arrays
 *
 * @see Requirements 22.5, 22.6, 10.2
 */
const config: PluginConfig = {
  plugins: [],
  options: {
    parallel: false,
    onError: 'continue',
    logLevel: 'info',
    excludePatterns: defaultPluginOptions.excludePatterns,
  },
}

export default config
