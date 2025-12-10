/**
 * RefInputPlugin - Input plugin for scanning ref project dist directories
 * Scans aindex/ref/{project}/dist directories and creates InputBundles with sourceProject metadata
 *
 * @see Requirements 38.1, 38.2, 20.1, 19.1
 * Feature: plugin-architecture
 */

/* eslint-disable no-inline-comments */

import type {
  InputBundle,
  InputPlugin,
  PluginContext,
} from '../core/types'
import { InputType } from '../core/types'
import { matchesExcludePattern } from '../utils/fileWalker'

/**
 * Configuration options for RefInputPlugin
 */
export interface RefInputPluginOptions {
  /**
   * Path to the ref directory
   * Required - must be provided by plugin configuration
   */
  refDir: string

  /**
   * Patterns to exclude from ref project discovery
   * Default: ['node_modules', '.git']
   */
  excludePatterns?: string[]

  /**
   * Name of the dist directory within each ref project
   * Default: 'dist'
   */
  distDirName?: string
}

/**
 * Information about a discovered ref project
 */
export interface RefProjectInfo {
  /**
   * Project name (directory name)
   */
  name: string

  /**
   * Absolute path to project root
   */
  path: string

  /**
   * Absolute path to dist directory
   */
  distPath: string

  /**
   * List of files found in dist directory
   */
  files: string[]
}

/**
 * Default patterns to exclude from ref project discovery
 */
const DEFAULT_EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
]

/**
 * Create a RefInputPlugin instance
 *
 * @param options - Plugin configuration options
 * @returns InputPlugin instance
 * @see Requirements 38.1, 38.2, 20.1
 */
export function createRefInputPlugin(
  options: RefInputPluginOptions,
): InputPlugin {
  const {
    refDir,
    excludePatterns = DEFAULT_EXCLUDE_PATTERNS,
    distDirName = 'dist',
  } = options

  return {
    name: 'refInput',
    priority: 20,

    async scan(ctx: PluginContext): Promise<InputBundle[]> {
      const bundles: InputBundle[] = []
      const refProjects: RefProjectInfo[] = []

      // Merge global exclusion patterns with plugin-specific patterns (Requirement 19.1)
      const globalExcludePatterns = ctx.config.options?.excludePatterns ?? []
      const allExcludePatterns = [...new Set([...excludePatterns, ...globalExcludePatterns])]

      // Check if ref directory exists (Requirement 38.1)
      const refExists = await ctx.fs.exists(refDir)
      if (!refExists) {
        ctx.log.warn(`Ref directory not found: ${refDir}`)
        ctx.registry.set('refInput', 'projects', [])
        return bundles
      }

      ctx.log.debug(`Scanning ref directory: ${refDir}`)

      try {
        // Scan for ref projects (Requirement 38.1)
        const entries = await ctx.fs.readdir(refDir, { withFileTypes: true })

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
          const relativePath = `ref/${entry.name}`
          if (matchesExcludePattern(relativePath, allExcludePatterns)) {
            ctx.log.debug(`Skipping excluded ref project: ${entry.name}`)
            continue
          }

          const projectPath = ctx.path.join(refDir, entry.name)
          const distPath = ctx.path.join(projectPath, distDirName)

          // Check if dist directory exists
          const distExists = await ctx.fs.exists(distPath)
          if (!distExists) {
            ctx.log.debug(`No dist directory found for ref project: ${entry.name}`)
            continue
          }

          // Scan dist directory recursively
          const projectInfo = await scanRefProjectDist(
            ctx,
            entry.name,
            projectPath,
            distPath,
          )

          if (projectInfo != null) {
            refProjects.push(projectInfo)

            // Create InputBundles for discovered files (Requirement 38.2)
            const projectBundles = await createInputBundlesForProject(
              ctx,
              projectInfo,
            )
            bundles.push(...projectBundles)
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        ctx.log.error(`Failed to scan ref directory: ${errorMsg}`)
      }

      // Register discovered ref projects in context
      ctx.registry.set('refInput', 'projects', refProjects)

      // Log count of discovered ref projects
      ctx.log.info(`Discovered ${refProjects.length} ref project(s) with ${bundles.length} file(s)`)

      return bundles
    },
  }
}

/**
 * Scan a ref project's dist directory recursively
 *
 * @param ctx - Plugin context
 * @param name - Project name
 * @param projectPath - Absolute path to project root
 * @param distPath - Absolute path to dist directory
 * @returns RefProjectInfo or null if not a valid ref project
 */
async function scanRefProjectDist(
  ctx: PluginContext,
  name: string,
  projectPath: string,
  distPath: string,
): Promise<RefProjectInfo | null> {
  try {
    const files: string[] = []

    // Recursively scan dist directory for all files
    await scanDirectoryRecursive(ctx, distPath, files)

    return {
      name,
      path: projectPath,
      distPath,
      files,
    }
  } catch (error) {
    ctx.log.debug(`Failed to scan ref project ${name}: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

/**
 * Recursively scan a directory and collect all file paths
 *
 * @param ctx - Plugin context
 * @param dirPath - Directory path to scan
 * @param files - Array to collect file paths
 */
async function scanDirectoryRecursive(
  ctx: PluginContext,
  dirPath: string,
  files: string[],
): Promise<void> {
  const entries = await ctx.fs.readdir(dirPath, { withFileTypes: true })

  for (const entry of entries) {
    if (typeof entry === 'string') {
      continue
    }

    const fullPath = ctx.path.join(dirPath, entry.name)

    if (entry.isDirectory()) {
      // Recursively scan subdirectories
      await scanDirectoryRecursive(ctx, fullPath, files)
    } else {
      files.push(fullPath)
    }
  }
}

/**
 * Create InputBundles for all files in a ref project
 *
 * @param ctx - Plugin context
 * @param projectInfo - Ref project information
 * @returns Array of InputBundles
 * @see Requirements 38.2, 20.1
 */
async function createInputBundlesForProject(
  ctx: PluginContext,
  projectInfo: RefProjectInfo,
): Promise<InputBundle[]> {
  const bundles: InputBundle[] = []

  for (const filePath of projectInfo.files) {
    const bundle = await createInputBundle(ctx, filePath, projectInfo)
    if (bundle != null) {
      bundles.push(bundle)
    }
  }

  return bundles
}

/**
 * Create an InputBundle for a single file
 * Classifies the file by InputType based on filename and directory
 *
 * @param ctx - Plugin context
 * @param filePath - Absolute path to file
 * @param projectInfo - Ref project information
 * @returns InputBundle or null if file cannot be read
 * @see Requirements 38.2, 20.1
 */
async function createInputBundle(
  ctx: PluginContext,
  filePath: string,
  projectInfo: RefProjectInfo,
): Promise<InputBundle | null> {
  try {
    const content = await ctx.fs.readFile(filePath)
    const fileName = ctx.path.basename(filePath)

    // Parse front matter for markdown files
    let frontMatter: Record<string, unknown> | undefined
    if (fileName.endsWith('.md')) {
      const parsed = ctx.capabilities.frontMatter.parse(content)
      frontMatter = parsed.frontMatter
    }

    // Create bundle with CONFIG_FILE type - ClassificationService will handle classification
    const bundle: InputBundle = {
      type: InputType.CONFIG_FILE, /* Will be classified by ClassificationService */
      path: filePath,
      content,
      sourceProject: projectInfo.name,
    }

    // Only add frontMatter if it exists
    if (frontMatter != null) {
      bundle.frontMatter = frontMatter
    }

    return bundle
  } catch (error) {
    ctx.log.debug(`Failed to read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

export default createRefInputPlugin
