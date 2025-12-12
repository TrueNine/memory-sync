/**
 * WorkspaceGroupInputPlugin - Input plugin for discovering workspaces from project group
 * Scans configured workspaceGroup directory and creates InputBundles for discovered files
 *
 * @see Requirements 37.1, 37.2, 37.3, 37.4, 37.5, 19.1
 * Feature: plugin-architecture
 */

import type {
  InputBundle,
  InputPlugin,
  PluginContext,
} from '../core/types'
import { USER_PROJECTS_DIR } from '@/constants'
import { InputType } from '../core/types'
import { matchesExcludePattern } from '../fileWalker'

/**
 * Configuration options for WorkspaceGroupInputPlugin
 */
export interface WorkspaceGroupInputPluginOptions {
  /**
   * Path to the workspace group directory
   * Default: ~/project/
   */
  workspaceGroupDir?: string

  /**
   * Patterns to exclude from workspace discovery
   * Default: ['node_modules', '.git', 'dist', 'build']
   */
  excludePatterns?: string[]

  /**
   * Config file patterns to scan for
   * Default: ['.editorconfig', '.vscode/settings.json', '.idea/**']
   */
  configFilePatterns?: string[]
}

/**
 * Information about a discovered workspace
 */
export interface WorkspaceInfo {
  /**
   * Workspace name (directory name)
   */
  name: string

  /**
   * Absolute path to workspace root
   */
  path: string

  /**
   * Whether AGENTS.md exists in this workspace
   */
  hasAgentsMd: boolean

  /**
   * List of config files found
   */
  configFiles: string[]
}

/**
 * Default patterns to exclude from workspace discovery
 */
const DEFAULT_EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.cache',
  'coverage',
]

/**
 * Default config file patterns to scan
 */
const DEFAULT_CONFIG_FILE_PATTERNS = [
  '.editorconfig',
  '.vscode/settings.json',
  '.idea',
]

/**
 * Create a WorkspaceGroupInputPlugin instance
 *
 * @param options - Plugin configuration options
 * @returns InputPlugin instance
 * @see Requirements 37.1, 37.2, 37.3, 37.4, 37.5
 */
export function createWorkspaceGroupInputPlugin(
  options: WorkspaceGroupInputPluginOptions = {},
): InputPlugin {
  const {
    workspaceGroupDir = USER_PROJECTS_DIR,
    excludePatterns = DEFAULT_EXCLUDE_PATTERNS,
    configFilePatterns = DEFAULT_CONFIG_FILE_PATTERNS,
  } = options

  return {
    name: 'workspaceGroupInput',
    priority: 10,

    async scan(ctx: PluginContext): Promise<InputBundle[]> {
      const bundles: InputBundle[] = []
      const workspaces: WorkspaceInfo[] = []

      // Merge global exclusion patterns with plugin-specific patterns (Requirement 19.1)
      const globalExcludePatterns = ctx.config.options?.excludePatterns ?? []
      const allExcludePatterns = [...new Set([...excludePatterns, ...globalExcludePatterns])]

      // Check if workspace group directory exists (Requirement 37.1)
      const groupExists = await ctx.fs.exists(workspaceGroupDir)
      if (!groupExists) {
        ctx.log.warn(`Workspace group directory not found: ${workspaceGroupDir}`)
        ctx.registry.set('workspaceGroupInput', 'workspaces', [])
        return bundles
      }

      ctx.log.debug(`Scanning workspace group: ${workspaceGroupDir}`)

      try {
        // Scan for workspaces (Requirement 37.1)
        const entries = await ctx.fs.readdir(workspaceGroupDir, { withFileTypes: true })

        for (const entry of entries) {
          // Skip non-directories
          if (typeof entry === 'string' || !entry.isDirectory()) {
            continue
          }

          // Skip excluded patterns - check both simple name and glob patterns (Requirement 19.1, 19.4)
          if (allExcludePatterns.includes(entry.name)) {
            continue
          }

          // Check glob patterns against relative path
          if (matchesExcludePattern(entry.name, allExcludePatterns)) {
            ctx.log.debug(`Skipping excluded path: ${entry.name}`)
            continue
          }

          const workspacePath = ctx.paths.resolve(workspaceGroupDir, entry.name)
          const workspaceInfo = await scanWorkspace(
            ctx,
            entry.name,
            workspacePath,
            configFilePatterns,
          )

          if (workspaceInfo != null) {
            workspaces.push(workspaceInfo)

            // Create MemoryPrompt InputBundle for AGENTS.md (Requirement 37.3)
            if (workspaceInfo.hasAgentsMd) {
              const agentsMdPath = ctx.path.join(workspacePath, 'AGENTS.md')
              const agentsMdBundle = await createMemoryPromptBundle(ctx, agentsMdPath, entry.name)
              if (agentsMdBundle != null) {
                bundles.push(agentsMdBundle)
              }
            }

            // Create ConfigFile InputBundles for config files (Requirement 37.4)
            for (const configFile of workspaceInfo.configFiles) {
              const configBundle = await createConfigFileBundle(ctx, configFile, entry.name)
              if (configBundle != null) {
                bundles.push(configBundle)
              }
            }
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        ctx.log.error(`Failed to scan workspace group: ${errorMsg}`)
      }

      // Register discovered workspaces in context (Requirement 37.2)
      ctx.registry.set('workspaceGroupInput', 'workspaces', workspaces)

      // Log count of discovered workspaces (Requirement 37.5)
      ctx.log.info(`Discovered ${workspaces.length} workspace(s) in ${workspaceGroupDir}`)

      return bundles
    },
  }
}

/**
 * Scan a single workspace directory for AGENTS.md and config files
 *
 * @param ctx - Plugin context
 * @param name - Workspace name
 * @param workspacePath - Absolute path to workspace
 * @param configFilePatterns - Patterns for config files to scan
 * @returns WorkspaceInfo or null if not a valid workspace
 */
async function scanWorkspace(
  ctx: PluginContext,
  name: string,
  workspacePath: string,
  configFilePatterns: string[],
): Promise<WorkspaceInfo | null> {
  try {
    // Check if it's a valid directory
    const stats = await ctx.fs.stat(workspacePath)
    if (!stats.isDirectory()) {
      return null
    }

    // Check for AGENTS.md
    const agentsMdPath = ctx.path.join(workspacePath, 'AGENTS.md')
    const hasAgentsMd = await ctx.fs.exists(agentsMdPath)

    // Scan for config files
    const configFiles: string[] = []
    for (const pattern of configFilePatterns) {
      const configPath = ctx.path.join(workspacePath, pattern)

      // Handle directory patterns (like .idea)
      if (!pattern.includes('/') && !pattern.includes('.')) {
        const dirExists = await ctx.fs.exists(configPath)
        if (dirExists) {
          const dirStats = await ctx.fs.stat(configPath)
          if (dirStats.isDirectory()) {
            configFiles.push(configPath)
          }
        }
      } else {
        // Handle file patterns
        const fileExists = await ctx.fs.exists(configPath)
        if (fileExists) {
          configFiles.push(configPath)
        }
      }
    }

    return {
      name,
      path: workspacePath,
      hasAgentsMd,
      configFiles,
    }
  } catch (error) {
    ctx.log.debug(`Failed to scan workspace ${name}: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

/**
 * Create a MemoryPrompt InputBundle for AGENTS.md
 *
 * @param ctx - Plugin context
 * @param filePath - Absolute path to AGENTS.md
 * @param sourceProject - Source project name
 * @returns InputBundle or null if file cannot be read
 * @see Requirement 37.3
 */
async function createMemoryPromptBundle(
  ctx: PluginContext,
  filePath: string,
  sourceProject: string,
): Promise<InputBundle | null> {
  try {
    const content = await ctx.fs.readFile(filePath)
    const { frontMatter } = ctx.capabilities.frontMatter.parse(content)

    return {
      type: InputType.MEMORY_PROMPT,
      path: filePath,
      content,
      frontMatter,
      sourceProject,
    }
  } catch (error) {
    ctx.log.debug(`Failed to read AGENTS.md from ${sourceProject}: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

/**
 * Create a ConfigFile InputBundle for a config file
 *
 * @param ctx - Plugin context
 * @param filePath - Absolute path to config file
 * @param sourceProject - Source project name
 * @returns InputBundle or null if file cannot be read
 * @see Requirement 37.4
 */
async function createConfigFileBundle(
  ctx: PluginContext,
  filePath: string,
  sourceProject: string,
): Promise<InputBundle | null> {
  try {
    // For directories (like .idea), we don't read content
    const stats = await ctx.fs.stat(filePath)
    if (stats.isDirectory()) {
      return {
        type: InputType.CONFIG_FILE,
        path: filePath,
        content: '',
        sourceProject,
      }
    }

    const content = await ctx.fs.readFile(filePath)

    return {
      type: InputType.CONFIG_FILE,
      path: filePath,
      content,
      sourceProject,
    }
  } catch (error) {
    ctx.log.debug(`Failed to read config file ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}
