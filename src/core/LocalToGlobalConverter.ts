/**
 * LocalToGlobalConverter - Handles local-to-global conversion for plugin outputs
 * Supports emitting to GlobalConfigDirectory when tool requires, merging content
 * from multiple Workspaces, and preserving source attribution.
 *
 * @see Requirements 18.1, 18.2, 18.3, 18.4
 * **Feature: plugin-architecture**
 */

import type {
  EmittedFile,
  PluginContext,
  PluginTargets,
} from './types'
import path from 'node:path'

/**
 * Configuration for local-to-global conversion
 * @see Requirements 18.1, 18.2, 18.3
 */
export interface LocalToGlobalConfig {
  /**
   * Source Workspace identifiers to merge content from
   * @see Requirement 18.2
   */
  sourceWorkspaces: string[]

  /**
   * Target tool name for global config directory resolution
   * Used to resolve path via targets.globalConfig(tool)
   * @see Requirement 18.1
   */
  targetTool: string

  /**
   * Merge strategy for combining content from multiple workspaces
   * - 'concat': Concatenate content with separators
   * - 'override': Later workspace content overrides earlier
   * - 'custom': Use custom merge function
   * @see Requirement 18.2
   */
  mergeStrategy: 'concat' | 'override' | 'custom'

  /**
   * Whether to preserve source attribution in output
   * When true, adds comments indicating source workspace
   * @see Requirement 18.3
   */
  preserveAttribution: boolean

  /**
   * Custom merge function (required when mergeStrategy is 'custom')
   * @param contents - Array of content strings from each workspace
   * @param sources - Array of source workspace identifiers
   * @returns Merged content string
   */
  customMerge?: (contents: string[], sources: string[]) => string

  /**
   * Separator to use between merged content (for 'concat' strategy)
   * Default: '\n\n'
   */
  separator?: string
}

/**
 * Result of a local-to-global conversion operation
 */
export interface ConversionResult {
  /**
   * Whether conversion was successful
   */
  success: boolean

  /**
   * Path where content was emitted
   */
  outputPath: string

  /**
   * Number of source workspaces merged
   */
  sourceCount: number

  /**
   * Source workspace identifiers that were merged
   */
  sources: string[]

  /**
   * Error message if conversion failed
   */
  error?: string
}

/**
 * Content item from a workspace for merging
 */
export interface WorkspaceContent {
  /**
   * Workspace identifier
   */
  workspaceId: string

  /**
   * Content from the workspace
   */
  content: string

  /**
   * Original file path within workspace
   */
  filePath: string
}

/**
 * LocalToGlobalConverter class
 * Handles conversion of workspace-local content to global configuration directories
 *
 * @example
 * ```typescript
 * const converter = new LocalToGlobalConverter(ctx.targets)
 *
 * // Emit to global config when tool requires
 * const globalPath = converter.resolveGlobalPath('claude')
 *
 * // Merge content from multiple workspaces
 * const merged = converter.mergeContent(contents, {
 *   mergeStrategy: 'concat',
 *   preserveAttribution: true,
 * })
 * ```
 *
 * @see Requirements 18.1, 18.2, 18.3, 18.4
 */
export class LocalToGlobalConverter {
  private targets: PluginTargets

  constructor(targets: PluginTargets) {
    this.targets = targets
  }

  /**
   * Resolve the global config directory path for a tool
   * Used when a target tool only supports global configuration
   *
   * @param tool - Tool name (e.g., 'claude', 'gemini', 'codex')
   * @returns Absolute path to the global config directory
   * @see Requirement 18.1
   */
  resolveGlobalPath(tool: string): string {
    return this.targets.globalConfig(tool)
  }

  /**
   * Resolve full path for a file in global config directory
   *
   * @param tool - Tool name
   * @param fileName - File name or relative path within global config
   * @returns Absolute path to the file
   * @see Requirement 18.1
   */
  resolveGlobalFilePath(tool: string, fileName: string): string {
    const globalDir = this.resolveGlobalPath(tool)
    return path.join(globalDir, fileName)
  }

  /**
   * Merge content from multiple workspaces
   * Supports concat, override, and custom merge strategies
   *
   * @param contents - Array of workspace content items
   * @param config - Merge configuration
   * @returns Merged content string
   * @see Requirements 18.2, 18.3
   */
  mergeContent(
    contents: WorkspaceContent[],
    config: Pick<LocalToGlobalConfig, 'mergeStrategy' | 'preserveAttribution' | 'customMerge' | 'separator'>,
  ): string {
    if (contents.length === 0) {
      return ''
    }

    if (contents.length === 1) {
      const firstContent = contents[0]
      if (!firstContent) {
        return ''
      }
      return config.preserveAttribution
        ? this.addAttribution(firstContent.content, firstContent.workspaceId)
        : firstContent.content
    }

    const { mergeStrategy, preserveAttribution, customMerge, separator = '\n\n' } = config

    switch (mergeStrategy) {
      case 'concat': {
        return this.concatMerge(contents, preserveAttribution, separator)
      }
      case 'override': {
        return this.overrideMerge(contents, preserveAttribution)
      }
      case 'custom': {
        if (!customMerge) {
          throw new Error('Custom merge function required when mergeStrategy is "custom"')
        }
        const contentStrings = contents.map((c) => c.content)
        const sources = contents.map((c) => c.workspaceId)
        return customMerge(contentStrings, sources)
      }
      default: {
        const exhaustiveCheck: never = mergeStrategy
        throw new Error(`Unknown merge strategy: ${String(exhaustiveCheck)}`)
      }
    }
  }

  /**
   * Concatenate content from multiple workspaces with separators
   *
   * @param contents - Array of workspace content items
   * @param preserveAttribution - Whether to add source attribution
   * @param separator - Separator between merged content
   * @returns Concatenated content
   */
  private concatMerge(
    contents: WorkspaceContent[],
    preserveAttribution: boolean,
    separator: string,
  ): string {
    const parts = contents.map((item) => {
      if (preserveAttribution) {
        return this.addAttribution(item.content, item.workspaceId)
      }
      return item.content
    })

    return parts.join(separator)
  }

  /**
   * Override merge - later workspace content overrides earlier
   *
   * @param contents - Array of workspace content items
   * @param preserveAttribution - Whether to add source attribution
   * @returns Content from the last workspace
   */
  private overrideMerge(
    contents: WorkspaceContent[],
    preserveAttribution: boolean,
  ): string {
    // Last workspace wins
    const lastContent = contents[contents.length - 1]
    if (!lastContent) {
      return ''
    }
    if (preserveAttribution) {
      return this.addAttribution(lastContent.content, lastContent.workspaceId)
    }
    return lastContent.content
  }

  /**
   * Add source attribution comment to content
   * Preserves source workspace information in output
   *
   * @param content - Original content
   * @param workspaceId - Source workspace identifier
   * @returns Content with attribution comment
   * @see Requirement 18.3
   */
  addAttribution(content: string, workspaceId: string): string {
    const attribution = `<!-- Source: ${workspaceId} -->\n`
    return attribution + content
  }

  /**
   * Create an EmittedFile for global config directory
   * Used when emitting to GlobalConfigDirectory
   *
   * @param fileName - Output file name
   * @param content - File content
   * @param sourceWorkspace - Optional source workspace for attribution
   * @returns EmittedFile configured for global config
   * @see Requirement 18.1
   */
  createGlobalEmittedFile(
    fileName: string,
    content: string,
    sourceWorkspace?: string,
  ): EmittedFile {
    const emittedFile: EmittedFile = {
      type: 'asset',
      fileName,
      source: content,
      targetType: 'globalConfig',
    }

    if (typeof sourceWorkspace === 'string' && sourceWorkspace.length > 0) {
      emittedFile.frontMatter = { sourceWorkspace }
    }

    return emittedFile
  }

  /**
   * Create EmittedFiles for both local and global targets
   * Used when both local and global outputs are needed
   *
   * @param fileName - Output file name
   * @param content - File content
   * @param sourceWorkspace - Optional source workspace for attribution
   * @returns Tuple of [localFile, globalFile]
   * @see Requirement 18.4
   */
  createDualEmittedFiles(
    fileName: string,
    content: string,
    sourceWorkspace?: string,
  ): [EmittedFile, EmittedFile] {
    const localFile: EmittedFile = {
      type: 'asset',
      fileName,
      source: content,
      targetType: 'workspace',
    }

    const globalFile: EmittedFile = {
      type: 'asset',
      fileName,
      source: content,
      targetType: 'globalConfig',
    }

    if (typeof sourceWorkspace === 'string' && sourceWorkspace.length > 0) {
      localFile.frontMatter = { sourceWorkspace }
      globalFile.frontMatter = { sourceWorkspace }
    }

    return [localFile, globalFile]
  }

  /**
   * Determine if a tool requires global-only configuration
   * Some tools only support global configuration directories
   *
   * @param tool - Tool name
   * @returns True if tool requires global-only config
   * @see Requirement 18.1
   */
  isGlobalOnlyTool(tool: string): boolean {
    // Tools that only support global configuration
    const globalOnlyTools = ['codex', 'gemini']
    return globalOnlyTools.includes(tool.toLowerCase())
  }

  /**
   * Determine if a tool supports both local and global configuration
   *
   * @param tool - Tool name
   * @returns True if tool supports dual output
   * @see Requirement 18.4
   */
  supportsDualOutput(tool: string): boolean {
    // Tools that support both local and global configuration
    const dualOutputTools = ['claude', 'droid']
    return dualOutputTools.includes(tool.toLowerCase())
  }
}

/**
 * Execute local-to-global conversion for a set of workspace contents
 * High-level function that handles the full conversion workflow
 *
 * @param ctx - Plugin context
 * @param config - Conversion configuration
 * @param contents - Workspace contents to convert
 * @param outputFileName - Output file name
 * @returns Conversion result
 * @see Requirements 18.1, 18.2, 18.3, 18.4
 */
export async function executeLocalToGlobalConversion(
  ctx: PluginContext,
  config: LocalToGlobalConfig,
  contents: WorkspaceContent[],
  outputFileName: string,
): Promise<ConversionResult> {
  const converter = new LocalToGlobalConverter(ctx.targets)

  try {
    // Merge content from multiple workspaces
    const mergedContent = converter.mergeContent(contents, config)

    // Resolve output path
    const outputPath = converter.resolveGlobalFilePath(config.targetTool, outputFileName)

    // Write to global config directory
    const targetDir = path.dirname(outputPath)
    await ctx.fs.ensureDir(targetDir)
    await ctx.fs.writeFile(outputPath, mergedContent)

    ctx.log.info(`LocalToGlobalConverter: Wrote ${outputPath} (merged from ${contents.length} workspace(s))`)

    return {
      success: true,
      outputPath,
      sourceCount: contents.length,
      sources: contents.map((c) => c.workspaceId),
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    ctx.log.error(`LocalToGlobalConverter: Failed to convert: ${errorMsg}`)

    return {
      success: false,
      outputPath: '',
      sourceCount: 0,
      sources: [],
      error: errorMsg,
    }
  }
}

/**
 * Create a LocalToGlobalConverter instance from plugin context
 * Convenience factory function
 *
 * @param ctx - Plugin context
 * @returns LocalToGlobalConverter instance
 */
export function createLocalToGlobalConverter(ctx: PluginContext): LocalToGlobalConverter {
  return new LocalToGlobalConverter(ctx.targets)
}

export default LocalToGlobalConverter
