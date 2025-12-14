/**
 * WorkspaceInputPlugin - Input plugin for discovering projects from workspace
 * Scans configured workspace directory and creates InputBundles for discovered files
 *
 * @see Requirements 37.1, 37.2, 37.3, 37.4, 37.5, 19.1
 * Feature: plugin-architecture
 */

import type {
  InputBundle,
  InputPlugin,
  PluginContext,
} from '@/core/types'
import { USER_PROJECTS_DIR } from '@/constants'
import { InputType } from '@/core/types'
import { matchesExcludePattern } from '@/fileWalker'

/**
 * Configuration options for WorkspaceInputPlugin
 */
export interface WorkspaceInputPluginOptions {
  /**
   * Path to the workspace directory
   * Default: ~/project/
   */
  workspaceDir?: string

  /**
   * Patterns to exclude from project discovery
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
 * Information about a discovered project
 */
export interface ProjectInfo {
  /**
   * Project name (directory name)
   */
  name: string

  /**
   * Absolute path to project root
   */
  path: string

  /**
   * Whether AGENTS.md exists in this project
   */
  hasAgentsMd: boolean

  /**
   * List of config files found
   */
  configFiles: string[]
}

/**
 * Default patterns to exclude from project discovery
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
 * Create a WorkspaceInputPlugin instance
 *
 * @param options - Plugin configuration options
 * @returns InputPlugin instance
 * @see Requirements 37.1, 37.2, 37.3, 37.4, 37.5
 */
export function createWorkspaceInputPlugin(
  options: WorkspaceInputPluginOptions = {},
): InputPlugin {
  const {
    workspaceDir = USER_PROJECTS_DIR,
    excludePatterns = DEFAULT_EXCLUDE_PATTERNS,
    configFilePatterns = DEFAULT_CONFIG_FILE_PATTERNS,
  } = options

  return {
    name: 'workspaceInput',
    priority: 10,

    async scan(ctx: PluginContext): Promise<InputBundle[]> {
      const bundles: InputBundle[] = []
      const projects: ProjectInfo[] = []

      // Merge global exclusion patterns with plugin-specific patterns (Requirement 19.1)
      const globalExcludePatterns = ctx.config.options?.excludePatterns ?? []
      const allExcludePatterns = [...new Set([...excludePatterns, ...globalExcludePatterns])]

      // Check if workspace directory exists (Requirement 37.1)
      const workspaceExists = await ctx.fs.exists(workspaceDir)
      if (!workspaceExists) {
        ctx.log.warn(`Workspace directory not found: ${workspaceDir}`)
        ctx.registry.set('workspaceInput', 'projects', [])
        return bundles
      }

      ctx.log.debug(`Scanning workspace: ${workspaceDir}`)

      try {
        // Scan for projects (Requirement 37.1)
        const entries = await ctx.fs.readdir(workspaceDir, { withFileTypes: true })

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

          const projectPath = ctx.paths.resolve(workspaceDir, entry.name)
          const projectInfo = await scanProject(
            ctx,
            entry.name,
            projectPath,
            configFilePatterns,
          )

          if (projectInfo != null) {
            projects.push(projectInfo)

            // Create MemoryPrompt InputBundle for AGENTS.md (Requirement 37.3)
            if (projectInfo.hasAgentsMd) {
              const agentsMdPath = ctx.path.join(projectPath, 'AGENTS.md')
              const agentsMdBundle = await createMemoryPromptBundle(ctx, agentsMdPath, entry.name)
              if (agentsMdBundle != null) {
                bundles.push(agentsMdBundle)
              }
            }

            // Create ConfigFile InputBundles for config files (Requirement 37.4)
            for (const configFile of projectInfo.configFiles) {
              const configBundle = await createConfigFileBundle(ctx, configFile, entry.name)
              if (configBundle != null) {
                bundles.push(configBundle)
              }
            }
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        ctx.log.error(`Failed to scan workspace: ${errorMsg}`)
      }

      // Register discovered projects in context (Requirement 37.2)
      ctx.registry.set('workspaceInput', 'projects', projects)

      // Log count of discovered projects (Requirement 37.5)
      ctx.log.info(`Discovered ${projects.length} project(s) in ${workspaceDir}`)

      return bundles
    },
  }
}

/**
 * Scan a single project directory for AGENTS.md and config files
 *
 * @param ctx - Plugin context
 * @param name - Project name
 * @param projectPath - Absolute path to project
 * @param configFilePatterns - Patterns for config files to scan
 * @returns ProjectInfo or null if not a valid project
 */
async function scanProject(
  ctx: PluginContext,
  name: string,
  projectPath: string,
  configFilePatterns: string[],
): Promise<ProjectInfo | null> {
  try {
    // Check if it's a valid directory
    const stats = await ctx.fs.stat(projectPath)
    if (!stats.isDirectory()) {
      return null
    }

    // Check for AGENTS.md
    const agentsMdPath = ctx.path.join(projectPath, 'AGENTS.md')
    const hasAgentsMd = await ctx.fs.exists(agentsMdPath)

    // Scan for config files
    const configFiles: string[] = []
    for (const pattern of configFilePatterns) {
      const configPath = ctx.path.join(projectPath, pattern)

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
      path: projectPath,
      hasAgentsMd,
      configFiles,
    }
  } catch (error) {
    ctx.log.debug(`Failed to scan project ${name}: ${error instanceof Error ? error.message : String(error)}`)
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
