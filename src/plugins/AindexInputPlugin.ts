/**
 * AindexInputPlugin - Input plugin for scanning aindex's own dist directory
 * Scans aindex/dist directory and creates InputBundles for GLOBAL.md, commands/, agents/, skills/
 * These bundles are excluded from transformation context as they are pure input sources
 *
 * @see Requirements 20.2, 20.3, 19.1
 * Feature: plugin-architecture
 */

/* eslint-disable no-inline-comments */

import type {
  InputBundle,
  InputPlugin,
  PluginContext,
} from '@/core/types'
import { InputType } from '@/core/types'
import { matchesExcludePattern } from '@/fileWalker'

/**
 * Configuration options for AindexInputPlugin
 */
export interface AindexInputPluginOptions {
  /**
   * Path to the aindex dist directory
   * Required - must be provided by plugin configuration
   */
  distDir: string

  /**
   * Patterns to exclude from scanning
   * Default: ['node_modules', '.git']
   */
  excludePatterns?: string[]
}

/**
 * Information about discovered aindex dist content
 */
export interface AindexDistInfo {
  /**
   * Absolute path to dist directory
   */
  distPath: string

  /**
   * Whether GLOBAL.md exists
   */
  hasGlobalMd: boolean

  /**
   * List of command files found
   */
  commandFiles: string[]

  /**
   * List of agent files found
   */
  agentFiles: string[]

  /**
   * List of skill directories found
   */
  skillDirs: string[]
}

/**
 * Default patterns to exclude from scanning
 */
const DEFAULT_EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
]

/**
 * Create an AindexInputPlugin instance
 *
 * @param options - Plugin configuration options (distDir is required)
 * @returns InputPlugin instance
 * @see Requirements 20.2, 20.3
 */
export function createAindexInputPlugin(
  options: AindexInputPluginOptions,
): InputPlugin {
  const {
    distDir,
    excludePatterns = DEFAULT_EXCLUDE_PATTERNS,
  } = options

  return {
    name: 'aindexInput',
    priority: 30,

    async scan(ctx: PluginContext): Promise<InputBundle[]> {
      const bundles: InputBundle[] = []

      // Merge global exclusion patterns with plugin-specific patterns (Requirement 19.1)
      const globalExcludePatterns = ctx.config.options?.excludePatterns ?? []
      const allExcludePatterns = [...new Set([...excludePatterns, ...globalExcludePatterns])]

      // Check if dist directory exists (Requirement 20.2)
      const distExists = await ctx.fs.exists(distDir)
      if (!distExists) {
        ctx.log.warn(`Aindex dist directory not found: ${distDir}`)
        ctx.registry.set('aindexInput', 'distInfo', null)
        return bundles
      }

      ctx.log.debug(`Scanning aindex dist directory: ${distDir}`)

      const distInfo: AindexDistInfo = {
        distPath: distDir,
        hasGlobalMd: false,
        commandFiles: [],
        agentFiles: [],
        skillDirs: [],
      }

      try {
        // Scan for GLOBAL.md (Requirement 20.3)
        const globalMdPath = ctx.path.join(distDir, 'GLOBAL.md')
        const globalMdExists = await ctx.fs.exists(globalMdPath)
        if (globalMdExists) {
          distInfo.hasGlobalMd = true
          const globalBundle = await createInputBundle(ctx, globalMdPath, InputType.CONFIG_FILE)
          if (globalBundle != null) {
            bundles.push(globalBundle)
          }
        }

        // Scan commands/ directory (Requirement 20.3)
        const commandsDir = ctx.path.join(distDir, 'commands')
        const commandsExists = await ctx.fs.exists(commandsDir)
        if (commandsExists) {
          const commandBundles = await scanDirectory(
            ctx,
            commandsDir,
            InputType.CONFIG_FILE, /* Will be classified by ClassificationService */
            allExcludePatterns,
          )
          bundles.push(...commandBundles)
          distInfo.commandFiles = commandBundles.map((b) => b.path)
        }

        // Scan agents/ directory (Requirement 20.3)
        const agentsDir = ctx.path.join(distDir, 'agents')
        const agentsExists = await ctx.fs.exists(agentsDir)
        if (agentsExists) {
          const agentBundles = await scanDirectory(
            ctx,
            agentsDir,
            InputType.CONFIG_FILE, /* Will be classified by ClassificationService */
            allExcludePatterns,
          )
          bundles.push(...agentBundles)
          distInfo.agentFiles = agentBundles.map((b) => b.path)
        }

        // Scan skills/ directory (Requirement 20.3)
        const skillsDir = ctx.path.join(distDir, 'skills')
        const skillsExists = await ctx.fs.exists(skillsDir)
        if (skillsExists) {
          const skillBundles = await scanSkillsDirectory(
            ctx,
            skillsDir,
            allExcludePatterns,
          )
          bundles.push(...skillBundles)
          distInfo.skillDirs = skillBundles.map((b) => ctx.path.dirname(b.path))
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        ctx.log.error(`Failed to scan aindex dist directory: ${errorMsg}`)
      }

      // Register dist info in context
      ctx.registry.set('aindexInput', 'distInfo', distInfo)

      // Log summary
      ctx.log.info(
        `Discovered ${bundles.length} file(s) from aindex dist: `
        + `${distInfo.hasGlobalMd ? '1 GLOBAL.md, ' : ''}`
        + `${distInfo.commandFiles.length} command(s), `
        + `${distInfo.agentFiles.length} agent(s), `
        + `${distInfo.skillDirs.length} skill(s)`,
      )

      return bundles
    },
  }
}

/**
 * Scan a directory recursively and create InputBundles for all markdown files
 *
 * @param ctx - Plugin context
 * @param dirPath - Directory path to scan
 * @param inputType - InputType to assign to discovered files
 * @param excludePatterns - Patterns to exclude (supports glob patterns)
 * @returns Array of InputBundles
 * @see Requirements 19.1, 19.4
 */
async function scanDirectory(
  ctx: PluginContext,
  dirPath: string,
  inputType: InputType,
  excludePatterns: string[],
): Promise<InputBundle[]> {
  const bundles: InputBundle[] = []

  try {
    const entries = await ctx.fs.readdir(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      if (typeof entry === 'string') {
        continue
      }

      // Skip excluded patterns - check both simple name and glob patterns (Requirement 19.1, 19.4)
      if (excludePatterns.includes(entry.name)) {
        continue
      }

      const fullPath = ctx.path.join(dirPath, entry.name)

      // Check glob patterns against relative path
      if (matchesExcludePattern(entry.name, excludePatterns)) {
        ctx.log.debug(`Skipping excluded path: ${entry.name}`)
        continue
      }

      if (entry.isDirectory()) {
        // Recursively scan subdirectories
        const subBundles = await scanDirectory(ctx, fullPath, inputType, excludePatterns)
        bundles.push(...subBundles)
      } else if (entry.name.endsWith('.md')) {
        // Create InputBundle for markdown files
        const bundle = await createInputBundle(ctx, fullPath, inputType)
        if (bundle != null) {
          bundles.push(bundle)
        }
      }
    }
  } catch (error) {
    ctx.log.debug(`Failed to scan directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`)
  }

  return bundles
}

/**
 * Scan skills directory and create InputBundles for skill files
 * Skills are organized in subdirectories, each containing a SKILL.md file
 *
 * @param ctx - Plugin context
 * @param skillsDir - Skills directory path
 * @param excludePatterns - Patterns to exclude
 * @returns Array of InputBundles
 */
async function scanSkillsDirectory(
  ctx: PluginContext,
  skillsDir: string,
  excludePatterns: string[],
): Promise<InputBundle[]> {
  const bundles: InputBundle[] = []

  try {
    const entries = await ctx.fs.readdir(skillsDir, { withFileTypes: true })

    for (const entry of entries) {
      if (typeof entry === 'string') {
        continue
      }

      // Skip excluded patterns
      if (excludePatterns.includes(entry.name)) {
        continue
      }

      // Skills are organized in subdirectories
      if (entry.isDirectory()) {
        const skillDir = ctx.path.join(skillsDir, entry.name)

        // Look for SKILL.md or any markdown file in the skill directory
        const skillFiles = await ctx.fs.readdir(skillDir)
        for (const file of skillFiles) {
          if (typeof file === 'string' && file.endsWith('.md')) {
            const filePath = ctx.path.join(skillDir, file)
            const bundle = await createInputBundle(ctx, filePath, InputType.CONFIG_FILE) /* Will be classified by ClassificationService */
            if (bundle != null) {
              bundles.push(bundle)
            }
          }
        }
      }
    }
  } catch (error) {
    ctx.log.debug(`Failed to scan skills directory ${skillsDir}: ${error instanceof Error ? error.message : String(error)}`)
  }

  return bundles
}

/**
 * Create an InputBundle for a single file
 *
 * @param ctx - Plugin context
 * @param filePath - Absolute path to file
 * @param inputType - InputType to assign
 * @returns InputBundle or null if file cannot be read
 */
async function createInputBundle(
  ctx: PluginContext,
  filePath: string,
  inputType: InputType,
): Promise<InputBundle | null> {
  try {
    const content = await ctx.fs.readFile(filePath)

    // Parse front matter for markdown files
    let frontMatter: Record<string, unknown> | undefined
    if (filePath.endsWith('.md')) {
      const parsed = ctx.capabilities.frontMatter.parse(content)
      frontMatter = parsed.frontMatter
    }

    const bundle: InputBundle = {
      type: inputType,
      path: filePath,
      content,
      sourceProject: 'aindex',
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
