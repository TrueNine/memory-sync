/**
 * Core plugin system types
 * Inspired by Vite/Rollup plugin architecture
 */

// ============================================================================
// Input Type Classification (Requirement 29.1)
// ============================================================================

/**
 * Input content types - plugins read from context by type
 * Classifies input files for selective processing by plugins
 */
export enum InputType {
  /**
   * Memory prompt files (AGENTS.md)
   */
  MEMORY_PROMPT = 'memoryPrompt',
  /**
   * Global prompt files (GLOBAL.md)
   */
  GLOBAL_PROMPT = 'globalPrompt',
  /**
   * Sub-agent configuration files
   */
  SUB_AGENT = 'subAgentAgenticConfig',
  /**
   * Fast command files
   */
  FAST_COMMAND = 'fastCommandAgenticConfig',
  /**
   * Skill files
   */
  SKILL = 'skillAgenticConfig',
  /**
   * Configuration files (.editorconfig, settings.json, etc.)
   */
  CONFIG_FILE = 'configFile',
}

/**
 * Input bundle from context (Requirement 29.4)
 * Contains type, path, content, and metadata for plugin processing
 */
export interface InputBundle {
  /**
   * Input type classification
   */
  type: InputType
  /**
   * File path (relative to workspace)
   */
  path: string
  /**
   * File content
   */
  content: string
  /**
   * Parsed front matter (if markdown file)
   */
  frontMatter?: Record<string, unknown>
  /**
   * Source project name (for ref projects)
   */
  sourceProject?: string
}

// ============================================================================
// Front Matter Types (Requirement 4.1)
// ============================================================================

/**
 * Front matter types for different AI tools
 */
export enum FrontMatterType {
  KIRO_ALWAYS = 'kiro-always',
  KIRO_FILE_MATCH = 'kiro-file-match',
  QODER_ALWAYS = 'qoder-always',
  QODER_GLOB = 'qoder-glob',
  ANTIGRAVITY_ALWAYS = 'antigravity-always',
  ANTIGRAVITY_GLOB = 'antigravity-glob',
  WORKFLOW_AUTO = 'workflow-auto',
}

/**
 * Options for front matter generation
 */
export interface FrontMatterOptions {
  type: FrontMatterType
  filePattern?: string
  additionalProps?: Record<string, unknown>
}

// ============================================================================
// Tool Category and Output Types (Requirements 22.3, 22.7)
// ============================================================================

/**
 * Tool category classification for output targets
 */
export type ToolCategory = 'cli' | 'ide' | 'config'

/**
 * Output target definition for plugins (Requirement 22.3, 22.7, 16.1)
 * Defines where and how a plugin emits files
 */
export interface PluginOutput {
  /**
   * Output identifier (unique within plugin)
   */
  id: string
  /**
   * Target tool category
   */
  category: ToolCategory
  /**
   * Target tool name (e.g., 'kiro', 'claude', 'cursor')
   */
  tool: string
  /**
   * Output target type
   */
  targetType: 'workspaceGroup' | 'workspace' | 'globalConfig'
  /**
   * Output path template (relative to workspace or global config directory)
   * For workspace: relative to workspace root (e.g., '.claude')
   * For globalConfig: relative to user home (e.g., '.claude')
   */
  path: string
  /**
   * Whether this output is enabled (default: true)
   */
  enabled?: boolean
  /**
   * Conditions that must be met before emitting files to this output
   * If any condition is not met, output is blocked and reason is logged
   *
   * @see Requirements 16.1, 16.2
   */
  conditions?: OutputCondition[]
}

/**
 * Resolved output paths for a plugin
 * Provides absolute paths for workspace and global config directories
 */
export interface ResolvedOutputPaths {
  /**
   * Absolute path to workspace output directory
   * e.g., /path/to/project/.claude
   */
  workspacePath?: string

  /**
   * Absolute path to global config output directory
   * e.g., ~/.claude or C:\Users\username\.claude
   */
  globalConfigPath?: string
}

// ============================================================================
// Filename Transformation (Requirements 14.1, 14.4)
// ============================================================================

/**
 * Filename transformation rule for plugins
 * Allows plugins to transform output filenames based on patterns
 */
export interface FilenameTransformRule {
  /**
   * Match pattern (regex or string)
   */
  pattern: RegExp | string
  /**
   * Replacement rule (string or function)
   */
  replacement: string | ((match: string) => string)
  /**
   * Applicable target tools (optional, applies to all if not specified)
   */
  tools?: string[]
}

/**
 * Result of a transform operation
 */
export interface TransformResult {
  code: string
  map?: SourceMap | null
}

/**
 * Source map interface (simplified)
 */
export interface SourceMap {
  version: number
  sources: string[]
  names: string[]
  mappings: string
  file?: string
  sourceRoot?: string
  sourcesContent?: string[]
}

// ============================================================================
// Emitted File (Requirements 3.1, 16.4)
// ============================================================================

/**
 * File emitted by a plugin
 * Represents an output artifact with metadata for processing
 */
export interface EmittedFile {
  /**
   * File type (asset or chunk)
   */
  type: 'asset' | 'chunk'
  /**
   * Output file name
   */
  fileName: string
  /**
   * File content
   */
  source: string
  /**
   * Parsed front matter (if markdown)
   */
  frontMatter?: Record<string, unknown>
  /**
   * Output target type
   */
  targetType?: 'workspaceGroup' | 'workspace' | 'globalConfig'
  /**
   * Input type this file originated from
   */
  inputType?: InputType
  /**
   * Whether output is blocked
   */
  blocked?: boolean
  /**
   * Reason for blocking (if blocked)
   */
  blockReason?: string
}

/**
 * File system utilities provided to plugins (Requirements 6.5, 13.1)
 * Provides async file operations for plugin use
 */
export interface PluginFileSystem {
  /**
   * Read file content as UTF-8 string
   * @param path - File path to read
   * @returns File content
   */
  readFile: (path: string) => Promise<string>

  /**
   * Write content to file, creating parent directories as needed
   * @param path - File path to write
   * @param content - Content to write
   */
  writeFile: (path: string, content: string) => Promise<void>

  /**
   * Check if file or directory exists
   * @param path - Path to check
   * @returns True if exists
   */
  exists: (path: string) => Promise<boolean>

  /**
   * Ensure directory exists, creating parent directories as needed
   * @param path - Directory path to ensure
   */
  ensureDir: (path: string) => Promise<void>

  /**
   * Copy file or directory
   * @param src - Source path
   * @param dest - Destination path
   */
  copy: (src: string, dest: string) => Promise<void>

  /**
   * Remove file or directory
   * @param path - Path to remove
   */
  remove: (path: string) => Promise<void>

  /**
   * Clean directory by removing all contents (Requirement 13.1)
   * Removes all files in the target directory before new files are written
   * @param path - Directory path to clean
   */
  /**
   * Clean directory by removing all contents (Requirement 13.1)
   * Removes all files in the target directory before new files are written
   * @param path - Directory path to clean
   */
  cleanDir: (path: string) => Promise<void>

  /**
   * Get file status
   * @param path - File path
   */
  stat: (path: string) => Promise<{ isDirectory: () => boolean, isFile: () => boolean, size: number, mtime: Date }>

  /**
   * Read directory contents
   * @param path - Directory path
   */
  readdir: (path: string, options?: { withFileTypes?: boolean }) => Promise<(string | { name: string, isDirectory: () => boolean })[]>

  /**
   * Read and parse JSON file
   * @param path - File path
   */
  readJson: <T = unknown>(path: string) => Promise<T>

  /**
   * Get file status (including symbolic links)
   * @param path - File path
   */
  lstat: (path: string) => Promise<{ isSymbolicLink: () => boolean, isDirectory: () => boolean, isFile: () => boolean }>

  /**
   * Read symbolic link
   * @param path - Link path
   */
  readlink: (path: string) => Promise<string>

  /**
   * Create symbolic link
   * @param target - Target path
   * @param path - Link path
   * @param type - Link type (for Windows)
   */
  symlink: (target: string, path: string, type?: string) => Promise<void>

  /**
   * Ensure symbolic link exists (fs-extra)
   * @param src - Source path
   * @param dest - Destination path
   */
  ensureSymlink: (src: string, dest: string) => Promise<void>
}

/**
 * Path utilities provided to plugins (Requirements 6.1, 6.2, 6.3)
 * Provides path resolution for different output targets
 */
export interface PluginPaths {
  /**
   * Root directory of the workspace/project
   * @see Requirement 6.1
   */
  root: string

  /**
   * Distribution output directory (aindex/dist)
   * @see Requirement 6.2
   */
  dist: string

  /**
   * Reference projects directory (aindex/ref)
   * @see Requirement 6.3
   */
  ref: string

  /**
   * User home directory (e.g., ~ or C:\Users\username)
   * Provides access to user-level configuration directories
   */
  userHome: string

  /**
   * Resolve path segments relative to root
   * @param segments - Path segments to join
   * @returns Resolved absolute path
   */
  resolve: (...segments: string[]) => string
}

/**
 * Output target resolution utilities (Requirements 6.1, 6.2, 6.3)
 * Provides resolvers for WorkspaceGroup, Workspace, and GlobalConfigDirectory
 */
export interface PluginTargets {
  /**
   * Resolve path relative to WorkspaceGroup directory
   * WorkspaceGroup is the project group directory (e.g., ~/project)
   *
   * @param name - WorkspaceGroup name or identifier
   * @returns Resolved absolute path to the workspace group
   * @see Requirement 6.1
   */
  workspaceGroup: (name: string) => string

  /**
   * Resolve path relative to a specific Workspace within a group
   * Workspace is a single project directory within a WorkspaceGroup
   *
   * @param group - WorkspaceGroup name
   * @param name - Workspace name within the group
   * @returns Resolved absolute path to the workspace
   * @see Requirement 6.2
   */
  workspace: (group: string, name: string) => string

  /**
   * Resolve path to GlobalConfigDirectory for a specific tool
   * GlobalConfigDirectory is the global config directory (e.g., ~/.claude, ~/.kiro)
   *
   * @param tool - Tool name (e.g., 'claude', 'kiro', 'gemini')
   * @returns Resolved absolute path to the global config directory
   * @see Requirement 6.3
   */
  globalConfig: (tool: string) => string
}

/**
 * Glob utilities provided to plugins
 */
export interface PluginGlob {
  /**
   * Search for files matching patterns
   * @param patterns - Pattern or patterns to match
   * @param options - Glob options
   */
  match: (patterns: string | string[], options?: Record<string, unknown>) => Promise<string[]>
}

/**
 * Path utilities (Node.js path module mirror) provided to plugins
 */
export interface PluginPathUtils {
  /**
   * Join all arguments together and normalize the resulting path.
   */
  join: (...paths: string[]) => string

  /**
   * Solve the relative path from from to to.
   */
  relative: (from: string, to: string) => string

  /**
   * Return the directory name of a path.
   */
  dirname: (path: string) => string

  /**
   * Return the last portion of a path.
   */
  basename: (path: string, ext?: string) => string

  /**
   * Return the extension of the path.
   */
  extname: (path: string) => string

  /**
   * Normalize a string path, reducing '..' and '.' parts.
   */
  normalize: (path: string) => string

  /**
   * The platform-specific file separator. '\\' or '/'.
   */
  sep: string

  /**
   * Resolve a sequence of paths or path segments into an absolute path.
   */
  resolve: (...paths: string[]) => string
}

/**
 * Log interface for plugin logging (Requirements 12.5, 12.6, 12.7)
 * ONLY allowed logging method for plugins - direct console/logger access is prohibited
 * Provides only debug, info, warn, and error methods
 */
export interface PluginLog {
  /**
   * Log debug message (lowest priority)
   * Only shown when log level is 'debug'
   *
   * @param message - Debug message
   * @param args - Additional arguments for formatting
   * @see Requirement 12.7
   */
  debug: (message: string, ...args: unknown[]) => void

  /**
   * Log info message
   * Shown when log level is 'info' or lower
   *
   * @param message - Info message
   * @param args - Additional arguments for formatting
   * @see Requirement 12.7
   */
  info: (message: string, ...args: unknown[]) => void

  /**
   * Log warning message
   * Shown when log level is 'warn' or lower
   *
   * @param message - Warning message
   * @param args - Additional arguments for formatting
   * @see Requirement 12.7
   */
  warn: (message: string, ...args: unknown[]) => void

  /**
   * Log error message (highest priority)
   * Always shown regardless of log level
   *
   * @param message - Error message
   * @param args - Additional arguments for formatting
   * @see Requirement 12.7
   */
  error: (message: string, ...args: unknown[]) => void
}

/**
 * Log adapter interface for plugin logging
 * @deprecated Use PluginLog instead
 */
export interface LogAdapter {
  info: (message: string, meta?: Record<string, unknown>) => void
  warn: (message: string, meta?: Record<string, unknown>) => void
  error: (message: string, meta?: Record<string, unknown>) => void
  debug: (message: string, meta?: Record<string, unknown>) => void
}

/**
 * Runtime mode flags for plugin execution (Requirements 21.1, 24.4)
 * Controls dry-run and clean-only behavior
 */
export interface PluginMode {
  /**
   * Dry-run mode flag
   * When true, simulates all operations without writing to disk
   * All file operations are logged but not executed
   *
   * @see Requirement 21.1
   */
  dryRun: boolean

  /**
   * Clean-only mode flag
   * When true, skips content generation and transformation
   * Only executes cleanup-related operations
   *
   * @see Requirement 24.4
   */
  cleanOnly: boolean

  /**
   * Dry-run tracker for recording simulated operations
   * Only available when dryRun is true
   *
   * @see Requirements 21.2, 21.3
   */
  dryRunTracker?: DryRunTracker
}

/**
 * Plugin configuration
 */
export interface PluginConfig {
  plugins: (Plugin | PluginFactory)[]
  options?: PluginGlobalOptions
}

/**
 * Global options for plugin execution
 * Controls runtime behavior of the plugin system
 *
 * @see Requirements 1.4
 */
export interface PluginGlobalOptions {
  /**
   * Enable parallel plugin execution
   * When true, independent plugins may execute concurrently
   */
  parallel?: boolean

  /**
   * Error handling strategy
   * - 'continue': Continue execution after errors
   * - 'stop': Stop execution on first error
   */
  onError?: 'continue' | 'stop'

  /**
   * Log level for plugin execution
   * Controls verbosity of log output
   */
  logLevel?: 'debug' | 'info' | 'warn' | 'error'

  /**
   * Global exclusion patterns for input scanning
   * Paths matching these patterns will be skipped during input plugin scanning
   * Uses standard glob syntax (e.g., ref/star/dist, star.log, starstar/node_modules)
   *
   * @see Requirements 19.1, 19.4
   */
  excludePatterns?: string[]

  /**
   * Dry-run mode flag
   * When true, simulates all operations without writing to disk
   *
   * @see Requirement 21.1
   */
  dryRun?: boolean

  /**
   * Clean-only mode flag
   * When true, skips content generation and only executes cleanup
   *
   * @see Requirement 24.4
   */
  cleanOnly?: boolean

  /**
   * Workspace group mappings
   * Maps workspace group names to their absolute paths
   */
  workspaceGroups?: Record<string, string>

  /**
   * Root directory of the workspace/project
   * If not provided, defaults to current working directory
   *
   * @see Requirement 6.1
   */
  root?: string
}

/**
 * Plugin factory function type
 */
export type PluginFactory = (options?: Record<string, unknown>) => Plugin

/**
 * Context provided to plugins during execution
 * Provides file system, paths, targets, logging, and capabilities
 */
export interface PluginContext {
  /**
   * File system utilities for file operations
   * @see Requirements 6.5, 13.1
   */
  fs: PluginFileSystem

  /**
   * Path utilities for path resolution
   * @see Requirements 6.1, 6.2, 6.3
   */
  paths: PluginPaths

  /**
   * Glob utilities for file pattern matching
   */
  glob: PluginGlob

  /**
   * Output target resolution utilities
   * @see Requirements 6.1, 6.2, 6.3
   */
  targets: PluginTargets

  /**
   * Path manipulation utilities (Node.js path mirror)
   */
  path: PluginPathUtils

  /**
   * Logging interface (ONLY allowed logging method for plugins)
   * @see Requirements 12.5, 12.6, 12.7
   */
  log: PluginLog

  /**
   * @deprecated Use log instead
   */
  logger: LogAdapter

  /**
   * Plugin configuration
   */
  config: PluginConfig

  /**
   * Runtime mode flags (dryRun, cleanOnly)
   * @see Requirements 21.1, 24.4
   */
  mode: PluginMode

  /**
   * Get input bundles by type (plugins read inputs from context)
   * @param type - Input type to filter by
   * @returns Array of InputBundles matching the type
   * @see Requirement 29.3
   */
  getInputBundles: (type: InputType) => InputBundle[]

  /**
   * Get all input bundles regardless of type
   * @returns Array of all InputBundles
   * @see Requirement 29.2
   */
  getAllInputBundles: () => InputBundle[]

  /**
   * System capabilities (plugins decide whether to use)
   * @see Requirements 30.1, 30.2, 30.3, 30.4
   */
  capabilities: SystemCapabilities

  /**
   * Register an emitted file artifact
   * @param artifact - File to emit
   * @returns File name of the emitted artifact
   * @see Requirement 3.1
   */
  emitFile: (artifact: EmittedFile) => string

  /**
   * Get copy of all emitted files (immutable)
   * @returns Copy of emitted files array
   * @see Requirement 3.4
   */
  getEmittedFiles: () => EmittedFile[]

  /**
   * Shared state for inter-plugin communication
   * @see Requirement 25.1
   */
  meta: Record<string, unknown>

  /**
   * Inter-plugin data sharing registry (type-safe)
   * Provides typed storage and retrieval of plugin output data
   * @see Requirements 25.1, 25.2, 25.3, 25.4
   */
  registry: PluginRegistry

  /**
   * Resolve output paths for a plugin based on its PluginOutput configuration
   * Returns absolute paths for workspace and global config directories
   *
   * @param outputs - Array of PluginOutput configurations
   * @returns ResolvedOutputPaths with absolute paths
   *
   * @example
   * ```typescript
   * const paths = ctx.resolveOutputPaths(plugin.outputs)
   * // paths.workspacePath = '/path/to/project/.claude'
   * // paths.globalConfigPath = '/home/user/.claude'
   * ```
   */
  resolveOutputPaths: (outputs: PluginOutput[]) => ResolvedOutputPaths
}

// ============================================================================
// Plugin Registry Interface (Requirements 25.1, 25.2, 25.3, 25.4)
// ============================================================================

/**
 * Plugin registry interface for inter-plugin data sharing
 * Stores plugin output data in a typed registry keyed by plugin identifier
 *
 * @example
 * ```typescript
 * // Plugin A stores data
 * ctx.registry.set('pluginA', 'workspaces', ['ws1', 'ws2'])
 *
 * // Plugin B retrieves data
 * const workspaces = ctx.registry.get<string[]>('pluginA', 'workspaces')
 * ```
 *
 * @see Requirements 25.1, 25.2, 25.3, 25.4
 */
export interface PluginRegistry {
  /**
   * Store plugin output data
   * @param pluginId - Plugin identifier
   * @param key - Data key
   * @param value - Data value
   * @see Requirement 25.1
   */
  set: <T>(pluginId: string, key: string, value: T) => void

  /**
   * Get plugin output data (read-only)
   * Returns undefined if data not found
   * @param pluginId - Plugin identifier
   * @param key - Data key
   * @returns Read-only data or undefined
   * @see Requirements 25.2, 25.4
   */
  get: <T>(pluginId: string, key: string) => Readonly<T> | undefined

  /**
   * Check if data exists
   * @param pluginId - Plugin identifier
   * @param key - Data key
   * @returns True if data exists
   * @see Requirement 25.2
   */
  has: (pluginId: string, key: string) => boolean

  /**
   * Get required plugin output data
   * Throws error if data is not found
   * @param pluginId - Plugin identifier
   * @param key - Data key
   * @returns Read-only data
   * @throws Error if data not found (includes missing plugin identifier)
   * @see Requirements 25.3, 25.4
   */
  getRequired: <T>(pluginId: string, key: string) => Readonly<T>
}

// ============================================================================
// Input Plugin Interface (Requirements 36.1, 36.2)
// ============================================================================

/**
 * Input plugin interface - responsible for scanning sources and populating context
 * InputPlugins execute before OutputPlugins to collect InputBundles
 *
 * @example
 * ```typescript
 * const myInputPlugin: InputPlugin = {
 *   name: 'myInput',
 *   priority: 50,
 *   scan: async (ctx) => {
 *     const files = await ctx.fs.readDir('src/')
 *     return files.map(f => ({
 *       type: InputType.MEMORY_PROMPT,
 *       path: f.path,
 *       content: f.content,
 *     }))
 *   },
 * }
 * ```
 */
export interface InputPlugin {
  /**
   * Unique plugin identifier (required)
   */
  name: string

  /**
   * Priority for execution order (lower = earlier, default: 100)
   * InputPlugins with lower priority values execute first
   */
  priority?: number

  /**
   * Scan sources and return InputBundles
   * Called during the input phase to populate context with discovered files
   *
   * @param ctx - Plugin context providing file system, paths, and logging utilities
   * @returns Array of InputBundles discovered from sources
   */
  scan: (ctx: PluginContext) => Promise<InputBundle[]> | InputBundle[]
}

/**
 * Factory function type for creating InputPlugins with options
 */
export type InputPluginFactory = (options?: Record<string, unknown>) => InputPlugin

// ============================================================================
// Hook Parameter Interfaces (Requirements 5.6, 5.7, 5.8)
// ============================================================================

/**
 * Parameters for cleanup hooks (beforeCleanup, afterCleanup)
 */
export interface CleanupParams {
  /**
   * Target paths to clean
   */
  targets: string[]
  /**
   * Whether running in dry-run mode
   */
  dryRun: boolean
}

/**
 * Parameters for buildStart hook
 */
export interface BuildStartParams {
  /**
   * List of plugin names to be executed
   */
  plugins: string[]
  /**
   * Current execution mode
   */
  mode: 'normal' | 'clean' | 'dryRun'
}

/**
 * Parameters for load hook
 */
export interface LoadParams {
  /**
   * Resolved ID from resolveId hook
   */
  resolvedId: string
}

/**
 * Parameters for transform hook
 */
export interface TransformParams {
  /**
   * Whether to generate source maps
   */
  sourceMap: boolean
}

/**
 * Parameters for generateBundle hook
 */
export interface GenerateBundleParams {
  /**
   * Files emitted so far
   */
  emittedFiles: EmittedFile[]
}

/**
 * Parameters for writeBundle hook
 */
export interface WriteBundleParams {
  /**
   * Output directory path
   */
  outputDir: string
  /**
   * Files to write
   */
  files: EmittedFile[]
}

/**
 * Parameters for buildEnd hook
 */
export interface BuildEndParams {
  /**
   * Whether build completed successfully
   */
  success: boolean
  /**
   * Errors encountered during build
   */
  errors: string[]
}

// ============================================================================
// Output Plugin Interface (Requirements 22.1, 9.1, 9.2, 28.1, 29.2)
// ============================================================================

/**
 * Output plugin interface - responsible for transforming and emitting files
 * OutputPlugins execute after InputPlugins and process InputBundles from context
 *
 * @example
 * ```typescript
 * const myOutputPlugin: OutputPlugin = {
 *   name: 'myOutput',
 *   priority: 100,
 *   inputTypes: [InputType.MEMORY_PROMPT],
 *   outputs: [{
 *     id: 'workspace',
 *     category: 'ide',
 *     tool: 'kiro',
 *     targetType: 'workspace',
 *     path: '.kiro/steering/',
 *   }],
 *   buildStart: async (ctx, params) => {
 *     ctx.logger.info(`Starting build in ${params.mode} mode`)
 *   },
 *   generateBundle: async (ctx, params) => {
 *     const bundles = ctx.getInputBundles(InputType.MEMORY_PROMPT)
 *     for (const bundle of bundles) {
 *       ctx.emitFile({
 *         type: 'asset',
 *         fileName: bundle.path,
 *         source: bundle.content,
 *       })
 *     }
 *   },
 * }
 * ```
 */
export interface OutputPlugin {
  /**
   * Unique plugin identifier (required)
   * Must be non-empty string
   * @see Requirements 22.1
   */
  name: string

  /**
   * Priority for execution order (lower = earlier, default: 100)
   * Plugins with lower priority values execute first among non-dependent plugins
   * @see Requirements 9.2
   */
  priority?: number

  /**
   * Names of plugins this plugin depends on
   * Dependent plugins will execute before this plugin
   * Circular dependencies will cause an error
   * @see Requirements 9.1
   */
  dependencies?: string[]

  /**
   * Parent plugin name to inherit from
   * Child plugin inherits all hooks and configurations from parent
   * Child implementations override parent implementations
   * @see Requirements 28.1
   */
  extends?: string

  /**
   * Input types this plugin handles
   * Plugin will only receive InputBundles matching these types
   * If not specified, plugin receives all InputBundles
   * @see Requirements 29.2
   */
  inputTypes?: InputType[]

  /**
   * Output target configurations
   * Defines where and how the plugin emits files
   * @see Requirements 22.3, 22.7
   */
  outputs?: PluginOutput[]

  /**
   * Filename transformation rules
   * Applied to output filenames during emission
   * @see Requirements 14.1, 14.4
   */
  filenameTransform?: FilenameTransformRule[]

  // -------------------------------------------------------------------------
  // Lifecycle Hooks (Requirements 5.1, 5.2, 5.6, 5.7, 5.8)
  // -------------------------------------------------------------------------

  /**
   * Called before cleanup to remove stale directories and files
   * Executes at the start of plugin lifecycle
   * @see Requirements 5.1
   */
  beforeCleanup?: (ctx: PluginContext, params: CleanupParams) => Promise<void> | void

  /**
   * Called at the start of the build after cleanup
   * Use for initialization and setup
   * @see Requirements 5.1
   */
  buildStart?: (ctx: PluginContext, params: BuildStartParams) => Promise<void> | void

  /**
   * Resolve a module ID to a path
   * Return null to defer to other plugins
   */
  resolveId?: (id: string, ctx: PluginContext) => Promise<string | null> | string | null

  /**
   * Load content for a resolved ID
   * Return null to defer to other plugins
   * @see Requirements 5.8
   */
  load?: (id: string, ctx: PluginContext, params: LoadParams) => Promise<string | null> | string | null

  /**
   * Transform content
   * Each plugin receives output of previous plugin in chain
   * @see Requirements 5.7
   */
  transform?: (
    code: string,
    id: string,
    ctx: PluginContext,
    params: TransformParams,
  ) => Promise<TransformResult | null> | TransformResult | null

  /**
   * Transform output filename
   * Called during file emission to apply naming conventions
   * Return null to keep original filename
   * @see Requirements 14.1
   */
  transformFilename?: (filename: string, ctx: PluginContext) => string | null

  /**
   * Generate output bundle
   * Called after all transforms to emit files
   * @see Requirements 5.6
   */
  generateBundle?: (ctx: PluginContext, params: GenerateBundleParams) => Promise<void> | void

  /**
   * Write output bundle to disk
   * Called after generateBundle to persist files
   * @see Requirements 5.6
   */
  writeBundle?: (ctx: PluginContext, params: WriteBundleParams) => Promise<void> | void

  /**
   * Called after cleanup to remove intermediate files
   * Executes after writeBundle
   * @see Requirements 5.2
   */
  afterCleanup?: (ctx: PluginContext, params: CleanupParams) => Promise<void> | void

  /**
   * Called at the end of the build
   * Use for cleanup and reporting
   * @see Requirements 5.1
   */
  buildEnd?: (ctx: PluginContext, params: BuildEndParams) => Promise<void> | void
}

/**
 * Factory function type for creating OutputPlugins with options
 */
export type OutputPluginFactory = (options?: Record<string, unknown>) => OutputPlugin

/**
 * Legacy Plugin interface (alias for OutputPlugin)
 * @deprecated Use OutputPlugin instead
 */
export interface Plugin {
  /**
   * Plugin name (required)
   */
  name: string

  /**
   * Priority for execution order (lower = earlier, default: 100)
   */
  priority?: number

  /**
   * Names of plugins this plugin depends on
   */
  dependencies?: string[]

  /**
   * Called at the start of the build
   */
  buildStart?: (ctx: PluginContext) => Promise<void> | void

  /**
   * Resolve a module ID to a path
   */
  resolveId?: (id: string, ctx: PluginContext) => Promise<string | null> | string | null

  /**
   * Load content for a resolved ID
   */
  load?: (id: string, ctx: PluginContext) => Promise<string | null> | string | null

  /**
   * Transform content
   */
  transform?: (
    code: string,
    id: string,
    ctx: PluginContext,
  ) => Promise<TransformResult | null> | TransformResult | null

  /**
   * Generate output bundle
   */
  generateBundle?: (ctx: PluginContext) => Promise<void> | void

  /**
   * Write output bundle to disk
   */
  writeBundle?: (ctx: PluginContext) => Promise<void> | void

  /**
   * Called at the end of the build
   */
  buildEnd?: (ctx: PluginContext) => Promise<void> | void
}

/**
 * Plugin execution state
 */
export interface PluginState {
  name: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  startTime?: number
  endTime?: number
  error?: Error
  emittedFiles: string[]
}

/**
 * Result of a plugin run
 */
export interface RunResult {
  success: boolean
  pluginsExecuted: number
  filesEmitted: number
  errors: string[]
  duration: number
}

/**
 * Extended result of a plugin run with InputPlugin/OutputPlugin support
 * @see Requirements 36.1, 36.2, 22.5, 22.6, 21.2, 21.3
 */
export interface ExtendedRunResult extends RunResult {
  /**
   * Number of InputPlugins executed
   */
  inputPluginsExecuted: number
  /**
   * Number of OutputPlugins executed
   */
  outputPluginsExecuted: number
  /**
   * Number of InputBundles collected from InputPlugins
   */
  inputBundlesCollected: number
  /**
   * Plugins that produced no output (warnings)
   */
  emptyPlugins: string[]
  /**
   * Dry-run statistics (only present when dryRun mode is enabled)
   * @see Requirements 21.2, 21.3
   */
  dryRunStats?: DryRunStats
}

/**
 * Plugin error with context
 */
export class PluginError extends Error {
  public pluginName: string
  public hookName: string
  public override cause?: Error | undefined

  constructor(
    message: string,
    pluginName: string,
    hookName: string,
    cause?: Error,
  ) {
    super(message)
    this.name = 'PluginError'
    this.pluginName = pluginName
    this.hookName = hookName
    this.cause = cause
  }
}

/**
 * Validation error for plugin registration
 */
export class ValidationError extends Error {
  public field: string

  constructor(message: string, field: string) {
    super(message)
    this.name = 'ValidationError'
    this.field = field
  }
}

// ============================================================================
// Code Block Types (Requirement 27.1)
// ============================================================================

/**
 * Parsed code block from Markdown
 * Represents a fenced code block with metadata for transformation
 */
export interface CodeBlock {
  /**
   * Language identifier (e.g., 'json', 'typescript', 'toon')
   */
  language: string
  /**
   * Raw code content (without fence markers)
   */
  content: string
  /**
   * Start line in original file (1-indexed)
   */
  startLine: number
  /**
   * End line in original file (1-indexed)
   */
  endLine: number
  /**
   * Fence style ('```' or '~~~')
   */
  fence: string
}

/**
 * Result of parsing front matter from content
 */
export interface ParsedFrontMatter {
  /**
   * Parsed front matter as key-value pairs
   */
  frontMatter: Record<string, unknown>
  /**
   * Content body without front matter
   */
  body: string
}

// ============================================================================
// System Capabilities (Requirements 30.1, 30.2, 30.3, 30.4)
// ============================================================================

/**
 * Front matter capability interface (Requirement 30.1, 4.1, 4.3)
 * Provides methods for parsing, serializing, merging, and generating front matter
 */
export interface FrontMatterCapability {
  /**
   * Parse YAML front matter from content
   * Extracts front matter block and returns structured object with body
   *
   * @param content - Markdown content with optional front matter
   * @returns Parsed front matter object and remaining body content
   * @see Requirements 4.1, 4.5, 4.6
   */
  parse: (content: string) => ParsedFrontMatter

  /**
   * Serialize front matter object to YAML format with body
   * Produces valid YAML front matter block followed by content
   *
   * @param frontMatter - Front matter key-value pairs
   * @param body - Content body to append after front matter
   * @returns Complete content with serialized front matter
   * @see Requirements 4.3
   */
  serialize: (frontMatter: Record<string, unknown>, body: string) => string

  /**
   * Merge new properties into existing front matter
   * Preserves original properties while adding/updating new ones
   *
   * @param existing - Existing front matter object
   * @param additions - New properties to merge
   * @returns Merged front matter object
   * @see Requirements 4.4
   */
  merge: (
    existing: Record<string, unknown>,
    additions: Record<string, unknown>,
  ) => Record<string, unknown>

  /**
   * Generate front matter for a specific type
   * Creates appropriate front matter based on tool requirements
   *
   * @param type - Front matter type (e.g., KIRO_ALWAYS, QODER_GLOB)
   * @param options - Optional configuration for generation
   * @returns Generated front matter object
   * @see Requirements 7.4
   */
  generateByType: (
    type: FrontMatterType,
    options?: FrontMatterOptions,
  ) => Record<string, unknown>
}

/**
 * Blank line cleaner capability interface (Requirement 30.2)
 * Provides method for cleaning whitespace from blank lines
 */
export interface BlankLineCleanerCapability {
  /**
   * Remove trailing whitespace from blank lines
   * Preserves BOM and line endings while cleaning indentation on empty lines
   *
   * @param content - Content to clean
   * @returns Cleaned content with whitespace removed from blank lines
   * @see Requirements 30.2
   */
  clean: (content: string) => string
}

/**
 * Content injection capability interface (Requirement 30.3, 15.1, 15.2)
 * Provides methods for prepending and appending content
 */
export interface ContentInjectionCapability {
  /**
   * Prepend content after front matter
   * Inserts injection content between front matter and body
   *
   * @param content - Original content (may include front matter)
   * @param injection - Content to prepend
   * @returns Content with injection prepended after front matter
   * @see Requirements 15.1
   */
  prepend: (content: string, injection: string) => string

  /**
   * Append content at end of file
   * Adds injection content at the end of the file
   *
   * @param content - Original content
   * @param injection - Content to append
   * @returns Content with injection appended
   * @see Requirements 15.2
   */
  append: (content: string, injection: string) => string
}

/**
 * Code block transformation capability interface (Requirement 30.4, 27.1)
 * Provides methods for extracting, transforming, and reassembling code blocks
 */
export interface CodeBlockTransformCapability {
  /**
   * Extract code blocks from Markdown content
   * Parses fenced code blocks with language identifiers
   *
   * @param content - Markdown content containing code blocks
   * @returns Array of parsed code blocks with metadata
   * @see Requirements 4.7, 4.8
   */
  extract: (content: string) => CodeBlock[]

  /**
   * Transform JSON to TOON format
   * Converts JSON code to TOON format with 2-space indentation
   *
   * @param json - JSON string to transform
   * @param format - Target format (currently only 'toon' supported)
   * @returns Transformed content in specified format
   * @see Requirements 27.1, 27.2, 27.4
   */
  transformJson: (json: string, format: 'toon') => string

  /**
   * Reassemble content with transformed code blocks
   * Replaces original code blocks with transformed versions
   *
   * @param content - Original Markdown content
   * @param blocks - Transformed code blocks to insert
   * @returns Content with code blocks replaced
   * @see Requirements 27.5, 27.6
   */
  reassemble: (content: string, blocks: CodeBlock[]) => string
}

/**
 * System capabilities provided by PluginContext (Requirements 30.1-30.4)
 * Plugins decide whether to use these capabilities
 *
 * @example
 * ```typescript
 * // Using front matter capability
 * const { frontMatter, body } = ctx.capabilities.frontMatter.parse(content)
 *
 * // Using blank line cleaner
 * const cleaned = ctx.capabilities.blankLineCleaner.clean(content)
 *
 * // Using content injection
 * const withHeader = ctx.capabilities.contentInjection.prepend(content, header)
 *
 * // Using code block transform
 * const blocks = ctx.capabilities.codeBlockTransform.extract(content)
 * ```
 */
export interface SystemCapabilities {
  /**
   * Front matter parsing and serialization capability
   * @see Requirements 30.1, 4.1, 4.3
   */
  frontMatter: FrontMatterCapability

  /**
   * Blank line cleaning capability
   * @see Requirements 30.2
   */
  blankLineCleaner: BlankLineCleanerCapability

  /**
   * Content injection capability
   * @see Requirements 30.3, 15.1, 15.2
   */
  contentInjection: ContentInjectionCapability

  /**
   * Code block transformation capability
   * @see Requirements 30.4, 27.1
   */
  codeBlockTransform: CodeBlockTransformCapability
}

// ============================================================================
// Transform Chain Types (Requirements 3.2, 3.3, 3.4)
// ============================================================================

/**
 * Record of a single transformation applied by a plugin
 * Used to track changes made during transform chain execution
 *
 * @see Requirement 3.4
 */
export interface TransformationRecord {
  /**
   * Name of the plugin that performed the transformation
   */
  pluginName: string
  /**
   * Length of input content before transformation
   */
  inputLength: number
  /**
   * Length of output content after transformation
   */
  outputLength: number
  /**
   * Whether the content was actually changed
   */
  changed: boolean
}

/**
 * Error that occurred during transformation
 * Captures plugin context for debugging
 *
 * @see Requirement 3.3
 */
export interface TransformError {
  /**
   * Name of the plugin where error occurred
   */
  pluginName: string
  /**
   * Error message
   */
  message: string
  /**
   * Original error object
   */
  error: Error
}

/**
 * Summary of transform chain execution
 * Provides details about all transformations applied and any errors
 *
 * @see Requirement 3.4
 */
export interface TransformChainSummary {
  /**
   * Length of original input content
   */
  originalLength: number
  /**
   * Length of final output content
   */
  finalLength: number
  /**
   * List of transformations applied (in order)
   */
  transformations: TransformationRecord[]
  /**
   * List of errors that occurred during transformation
   */
  errors: TransformError[]
  /**
   * Whether all transformations completed successfully
   */
  success: boolean
}

// ============================================================================
// Dry-Run Types (Requirements 21.1, 21.2, 21.3, 21.4)
// ============================================================================

/**
 * Type of file operation tracked during dry-run
 * @see Requirement 21.2
 */
export type DryRunOperationType
  = | 'create'
    | 'modify'
    | 'delete'
    | 'copy'
    | 'ensureDir'
    | 'cleanDir'
    | 'symlink'
    | 'ensureSymlink'

/**
 * Single file operation tracked during dry-run mode
 * @see Requirement 21.2
 */
export interface DryRunOperation {
  /**
   * Type of operation
   */
  type: DryRunOperationType
  /**
   * Target path for the operation
   */
  path: string
  /**
   * Source path (for copy operations)
   */
  sourcePath?: string
  /**
   * Timestamp when operation was recorded
   */
  timestamp: number
}

/**
 * Statistics for dry-run mode execution
 * Provides counts of files that would be created, modified, or deleted
 *
 * @see Requirements 21.2, 21.3
 */
export interface DryRunStats {
  /**
   * Number of files that would be created
   */
  filesToCreate: number
  /**
   * Number of files that would be modified
   */
  filesToModify: number
  /**
   * Number of files that would be deleted
   */
  filesToDelete: number
  /**
   * Number of directories that would be created
   */
  directoriesToCreate: number
  /**
   * Number of directories that would be cleaned
   */
  directoriesToClean: number
  /**
   * Number of copy operations that would be performed
   */
  copyOperations: number
  /**
   * List of all operations that would be performed
   */
  operations: DryRunOperation[]
}

/**
 * Dry-run tracker interface for tracking simulated operations
 * @see Requirements 21.1, 21.2, 21.3
 */
export interface DryRunTracker {
  /**
   * Record a file operation
   * @param operation - Operation to record
   */
  record: (operation: DryRunOperation) => void

  /**
   * Get current statistics
   * @returns Current dry-run statistics
   */
  getStats: () => DryRunStats

  /**
   * Reset all tracked operations
   */
  reset: () => void

  /**
   * Check if any errors occurred during simulation
   * @returns True if no errors occurred
   */
  isSuccess: () => boolean

  /**
   * Record an error during simulation
   * @param error - Error message
   */
  recordError: (error: string) => void

  /**
   * Get all recorded errors
   * @returns Array of error messages
   */
  getErrors: () => string[]
}

// ============================================================================
// Output Blocking Types (Requirements 16.1, 16.2, 16.3, 16.4)
// ============================================================================

/**
 * Condition type for output blocking
 * Defines the type of condition to evaluate before emitting files
 *
 * @see Requirement 16.1
 */
export type OutputConditionType = 'toolInstalled' | 'configExists' | 'custom'

/**
 * Output condition interface for blocking file emission
 * Defines conditions that must be met before files are emitted
 *
 * @example
 * ```typescript
 * // Block output if tool is not installed
 * const condition: OutputCondition = {
 *   type: 'toolInstalled',
 *   params: { tool: 'claude' },
 * }
 *
 * // Block output if config file doesn't exist
 * const configCondition: OutputCondition = {
 *   type: 'configExists',
 *   params: { path: '.claude/config.json' },
 * }
 *
 * // Custom condition with check function
 * const customCondition: OutputCondition = {
 *   type: 'custom',
 *   check: async (ctx) => {
 *     const exists = await ctx.fs.exists('.claude')
 *     return exists
 *   },
 * }
 * ```
 *
 * @see Requirements 16.1, 16.3
 */
export interface OutputCondition {
  /**
   * Condition type
   * - 'toolInstalled': Check if a tool is installed on the system
   * - 'configExists': Check if a configuration file exists
   * - 'custom': Use a custom check function
   */
  type: OutputConditionType

  /**
   * Condition parameters (type-specific)
   * - For 'toolInstalled': { tool: string } - name of the tool to check
   * - For 'configExists': { path: string } - path to the config file
   * - For 'custom': optional additional parameters
   */
  params?: Record<string, unknown>

  /**
   * Custom check function (required for 'custom' type)
   * Returns true if condition is met, false otherwise
   *
   * @param ctx - Plugin context for accessing file system and other utilities
   * @returns Boolean indicating if condition is met
   */
  check?: (ctx: PluginContext) => boolean | Promise<boolean>
}

/**
 * Blocked output record
 * Represents a file that was blocked from emission due to unmet conditions
 *
 * @see Requirements 16.2, 16.4
 */
export interface BlockedOutput {
  /**
   * Name of the file that was blocked
   */
  fileName: string

  /**
   * Human-readable reason for blocking
   */
  reason: string

  /**
   * The condition that caused the block
   */
  condition: OutputCondition
}

/**
 * Result of evaluating an output condition
 */
export interface OutputConditionResult {
  /**
   * Whether the condition was met
   */
  met: boolean

  /**
   * Reason for the result (especially useful when not met)
   */
  reason: string
}

// ============================================================================
// Cleanup Types (Requirements 24.1, 24.2, 24.3, 24.5, 24.7)
// ============================================================================

/**
 * Cleanup target collected from plugin output configurations
 * Represents a path that should be cleaned during cleanup mode
 *
 * @see Requirements 24.1, 24.2, 24.7
 */
export interface CleanupTarget {
  /**
   * Name of the plugin that owns this target
   */
  pluginName: string
  /**
   * Target path to clean (file or directory)
   */
  path: string
  /**
   * Type of target (file or directory)
   */
  type: 'file' | 'directory'
  /**
   * Output target type for path resolution
   */
  targetType: 'workspaceGroup' | 'workspace' | 'globalConfig'
}

/**
 * Result of cleanup operation
 * Provides summary of files and directories removed
 *
 * @see Requirements 24.3, 24.5
 */
export interface CleanResult {
  /**
   * Whether cleanup completed successfully
   */
  success: boolean
  /**
   * Number of files removed
   */
  filesRemoved: number
  /**
   * Number of directories removed
   */
  directoriesRemoved: number
  /**
   * Targets grouped by plugin name
   */
  targetsByPlugin: Record<string, string[]>
  /**
   * Errors encountered during cleanup
   */
  errors: string[]
  /**
   * Total duration in milliseconds
   */
  duration: number
}

// ============================================================================
// Configuration System Types
// ============================================================================

/**
 * Input classification rule for determining file types
 * Defines how to categorize input files based on patterns and metadata
 */
export interface InputClassificationRule {
  /**
   * Input type classification
   */
  type: InputType
  /**
   * Glob patterns to match files
   */
  patterns: string[]
  /**
   * Front matter types that should trigger this classification
   */
  frontMatterTypes?: FrontMatterType[]
  /**
   * Priority for rule matching (higher = more specific)
   */
  priority?: number
}

/**
 * Input classification configuration
 * Controls how input files are categorized into types
 */
export interface InputClassificationConfig {
  /**
   * List of classification rules
   * Rules are evaluated in order, first match wins
   */
  rules: InputClassificationRule[]
  /**
   * Default type for files that don't match any rule
   */
  defaultType: InputType
}

/**
 * Path transformation configuration
 * Defines how output paths are transformed for a plugin
 */
export interface PathTransformConfig {
  /**
   * Output directory path (relative to workspace root or global config)
   */
  outputDir: string
  /**
   * Filename transformation function
   * Takes original filename and returns transformed filename
   */
  filenameTransform?: (filename: string) => string
  /**
   * Content transformation function
   * Takes original content and bundle, returns transformed content
   */
  contentTransform?: (content: string, bundle: InputBundle) => string
  /**
   * Whether to create directory if it doesn't exist
   */
  createDir?: boolean
  /**
   * File mode for created files (Unix-style permissions)
   */
  fileMode?: string
}

/**
 * Plugin configuration system
 * Replaces hardcoded values with configurable options
 */
export interface PluginSystemConfig {
  /**
   * Input file classification rules
   */
  inputClassification: InputClassificationConfig
  /**
   * Path configurations for each plugin
   * Key is plugin name, value is path transformation config
   */
  paths: Record<string, PathTransformConfig>
  /**
   * Front matter type mappings
   * Maps string identifiers to FrontMatterType enum values
   */
  frontMatterMapping: Record<string, FrontMatterType>
  /**
   * Global path configurations
   */
  globalPaths: {
    /**
     * Default output directory for workspace-relative files
     */
    workspaceOutput: string
    /**
     * Default output directory for global config files
     */
    globalOutput: string
    /**
     * Default temporary directory
     */
    tempDir: string
  }
}

/**
 * User configuration interface
 * Partial configuration that users can override
 */
export interface UserPluginConfig {
  /**
   * Override input classification rules
   */
  inputClassification?: Partial<InputClassificationConfig>
  /**
   * Override path configurations for specific plugins
   */
  paths?: Record<string, Partial<PathTransformConfig>>
  /**
   * Override front matter mappings
   */
  frontMatterMapping?: Record<string, FrontMatterType>
  /**
   * Override global paths
   */
  globalPaths?: Partial<PluginSystemConfig['globalPaths']>
  /**
   * Plugin selection and ordering
   */
  plugins?: {
    /**
     * List of input plugins to enable (all if not specified)
     */
    input?: string[]
    /**
     * List of output plugins to enable (all if not specified)
     */
    output?: string[]
  }
}

// ============================================================================
// Bootstrap Types (Requirements 1.2, 3.4, 3.5, 6.1, 6.2, 6.3)
// ============================================================================

/**
 * Options for PluginRunner.bootstrap() method
 * Provides all startup parameters for the bootstrap process
 *
 * @example
 * ```typescript
 * const result = await PluginRunner.bootstrap({
 *   config: myPluginConfig,
 *   dryRun: true,
 *   root: '/path/to/project',
 * })
 * ```
 *
 * @see Requirements 1.2, 3.5
 */
export interface BootstrapOptions {
  /**
   * Plugin configuration containing plugins and global options
   * If not provided, default configuration will be loaded from plugins.config.ts
   *
   * @see Requirement 3.1
   */
  config?: PluginConfig

  /**
   * Global options to override config options
   * These options take precedence over PluginConfig.options
   *
   * @see Requirement 5.3
   */
  options?: PluginGlobalOptions

  /**
   * Dry-run mode flag
   * When true, simulates all operations without writing to disk
   *
   * @see Requirement 21.1
   */
  dryRun?: boolean

  /**
   * Clean-only mode flag
   * When true, skips content generation and only executes cleanup
   *
   * @see Requirement 24.4
   */
  cleanOnly?: boolean

  /**
   * Workspace group mappings
   * Maps workspace group names to their absolute paths
   *
   * @example
   * ```typescript
   * workspaceGroups: {
   *   'default': '/home/user/projects',
   *   'work': '/home/user/work-projects',
   * }
   * ```
   */
  workspaceGroups?: Record<string, string>

  /**
   * Root directory of the workspace/project
   * If not provided, defaults to current working directory
   *
   * @see Requirement 6.1
   */
  root?: string
}

/**
 * Result of PluginRunner.bootstrap() execution
 * Provides comprehensive statistics about the bootstrap process
 *
 * @example
 * ```typescript
 * const result = await PluginRunner.bootstrap({ dryRun: true })
 * if (result.success) {
 *   console.log(`Executed ${result.pluginsExecuted} plugins`)
 *   console.log(`Emitted ${result.filesEmitted} files`)
 * } else {
 *   console.error('Errors:', result.errors)
 * }
 * ```
 *
 * @see Requirements 3.4, 6.1, 6.2, 6.3
 */
export interface BootstrapResult {
  /**
   * Whether bootstrap completed successfully
   * True if no errors occurred during execution
   */
  success: boolean

  /**
   * Total duration of bootstrap execution in milliseconds
   */
  duration: number

  /**
   * Total number of plugins executed (input + output)
   */
  pluginsExecuted: number

  /**
   * Number of InputPlugins executed
   */
  inputPluginsExecuted: number

  /**
   * Number of OutputPlugins executed
   */
  outputPluginsExecuted: number

  /**
   * Number of InputBundles collected from InputPlugins
   */
  inputBundlesCollected: number

  /**
   * Number of files emitted by OutputPlugins
   */
  filesEmitted: number

  /**
   * List of error messages encountered during execution
   * Each error includes plugin name and hook context
   *
   * @see Requirement 6.4
   */
  errors: string[]

  /**
   * List of plugin names that produced no output
   * Useful for identifying plugins that may need attention
   */
  emptyPlugins: string[]

  /**
   * Dry-run statistics (only present when dryRun mode is enabled)
   * Contains counts of files that would be created, modified, or deleted
   *
   * @see Requirements 6.3, 21.2, 21.3
   */
  dryRunStats?: DryRunStats

  /**
   * Cleanup result (only present when cleanOnly mode is enabled)
   * Contains summary of files and directories removed
   *
   * @see Requirements 24.3, 24.5
   */
  cleanResult?: CleanResult
}
