/**
 * DocLinkInputPlugin - Input plugin for scanning project documentation files
 * Scans aindex/projects directory and discovers .md files for documentation linking
 *
 * @see Requirements 2.1, 2.2, 2.3, 2.4
 * Feature: commands-to-plugins
 */

import type {
  InputBundle,
  InputPlugin,
  PluginContext,
} from '../core/types'
import { InputType } from '../core/types'

/**
 * Configuration options for DocLinkInputPlugin
 */
export interface DocLinkInputPluginOptions {
  /**
   * Path to the projects directory containing .md files
   * Default: aindex/projects
   */
  projectsDir: string

  /**
   * Patterns to exclude from scanning
   * Default: ['node_modules', '.git']
   */
  excludePatterns?: string[]
}

/**
 * Information about a discovered project documentation
 */
export interface DocLinkProjectInfo {
  /**
   * Project name (extracted from .md filename)
   */
  name: string

  /**
   * Absolute path to main documentation file
   */
  mainDocPath: string

  /**
   * Absolute path to additional docs directory (if exists)
   */
  additionalDocsDir?: string

  /**
   * Absolute path to corresponding ref project directory
   */
  refProjectDir?: string
}

/**
 * Default patterns to exclude from scanning
 */
const DEFAULT_EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
]

/**
 * Create a DocLinkInputPlugin instance
 *
 * @param options - Plugin configuration options
 * @returns InputPlugin instance
 * @see Requirements 2.1, 2.2, 2.3, 2.4
 */
export function createDocLinkInputPlugin(
  options: DocLinkInputPluginOptions,
): InputPlugin {
  const {
    projectsDir,
    excludePatterns = DEFAULT_EXCLUDE_PATTERNS,
  } = options

  return {
    name: 'docLinkInput',
    priority: 40,

    async scan(ctx: PluginContext): Promise<InputBundle[]> {
      const bundles: InputBundle[] = []
      const projects: DocLinkProjectInfo[] = []

      // Merge global exclusion patterns with plugin-specific patterns
      const globalExcludePatterns = ctx.config.options?.excludePatterns ?? []
      const allExcludePatterns = [...new Set([...excludePatterns, ...globalExcludePatterns])]

      // Check if projects directory exists (Requirement 2.4)
      const projectsDirExists = await ctx.fs.exists(projectsDir)
      if (!projectsDirExists) {
        ctx.log.warn(`Projects directory not found: ${projectsDir}`)
        ctx.registry.set('docLinkInput', 'projects', [])
        return bundles
      }

      ctx.log.debug(`Scanning projects directory: ${projectsDir}`)

      try {
        // Scan for .md files in projects directory (Requirement 2.1)
        const entries = await ctx.fs.readdir(projectsDir, { withFileTypes: true })

        for (const entry of entries) {
          if (typeof entry === 'string') {
            continue
          }

          // Skip excluded patterns
          if (allExcludePatterns.includes(entry.name)) {
            continue
          }

          // Process .md files (Requirement 2.1)
          if (!entry.isDirectory() && entry.name.endsWith('.md')) {
            const projectName = ctx.path.basename(entry.name, '.md')
            const mainDocPath = ctx.path.join(projectsDir, entry.name)

            // Check for additional docs directory
            const additionalDocsDir = ctx.path.join(projectsDir, projectName)
            const additionalDocsDirExists = await ctx.fs.exists(additionalDocsDir)

            const projectInfo: DocLinkProjectInfo = {
              name: projectName,
              mainDocPath,
            }

            if (additionalDocsDirExists) {
              const stats = await ctx.fs.stat(additionalDocsDir)
              if (stats.isDirectory()) {
                projectInfo.additionalDocsDir = additionalDocsDir
              }
            }

            projects.push(projectInfo)

            // Create InputBundle for main doc file (Requirement 2.2)
            const mainBundle = await createInputBundle(ctx, mainDocPath, projectName)
            if (mainBundle != null) {
              bundles.push(mainBundle)
            }

            // Create InputBundles for additional docs
            if (projectInfo.additionalDocsDir != null) {
              const additionalBundles = await scanAdditionalDocs(
                ctx,
                projectInfo.additionalDocsDir,
                projectName,
                allExcludePatterns,
              )
              bundles.push(...additionalBundles)
            }
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        ctx.log.error(`Failed to scan projects directory: ${errorMsg}`)
      }

      // Register discovered projects in context (Requirement 2.3)
      ctx.registry.set('docLinkInput', 'projects', projects)

      // Log summary
      ctx.log.info(`Discovered ${projects.length} project documentation(s) with ${bundles.length} file(s)`)

      return bundles
    },
  }
}

/**
 * Scan additional docs directory recursively
 *
 * @param ctx - Plugin context
 * @param dirPath - Directory path to scan
 * @param projectName - Project name for source tracking
 * @param excludePatterns - Patterns to exclude
 * @returns Array of InputBundles
 */
async function scanAdditionalDocs(
  ctx: PluginContext,
  dirPath: string,
  projectName: string,
  excludePatterns: string[],
): Promise<InputBundle[]> {
  const bundles: InputBundle[] = []

  try {
    const entries = await ctx.fs.readdir(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      if (typeof entry === 'string') {
        continue
      }

      // Skip excluded patterns
      if (excludePatterns.includes(entry.name)) {
        continue
      }

      const fullPath = ctx.path.join(dirPath, entry.name)

      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        const subBundles = await scanAdditionalDocs(ctx, fullPath, projectName, excludePatterns)
        bundles.push(...subBundles)
      } else if (entry.name.endsWith('.md')) {
        // Create InputBundle for markdown files
        const bundle = await createInputBundle(ctx, fullPath, projectName)
        if (bundle != null) {
          bundles.push(bundle)
        }
      }
    }
  } catch (error) {
    ctx.log.debug(`Failed to scan additional docs directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`)
  }

  return bundles
}

/**
 * Create an InputBundle for a documentation file
 *
 * @param ctx - Plugin context
 * @param filePath - Absolute path to file
 * @param projectName - Project name for source tracking
 * @returns InputBundle or null if file cannot be read
 * @see Requirement 2.2
 */
async function createInputBundle(
  ctx: PluginContext,
  filePath: string,
  projectName: string,
): Promise<InputBundle | null> {
  try {
    const content = await ctx.fs.readFile(filePath)

    // Parse front matter for markdown files
    const parsed = ctx.capabilities.frontMatter.parse(content)
    const frontMatter = parsed.frontMatter

    // Create bundle with CONFIG_FILE type (Requirement 2.2)
    const bundle: InputBundle = {
      type: InputType.CONFIG_FILE,
      path: filePath,
      content,
      sourceProject: projectName,
    }

    // Only add frontMatter if it exists
    if (frontMatter != null && Object.keys(frontMatter).length > 0) {
      bundle.frontMatter = frontMatter
    }

    return bundle
  } catch (error) {
    ctx.log.debug(`Failed to read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

export default createDocLinkInputPlugin
