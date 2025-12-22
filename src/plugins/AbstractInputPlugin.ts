import type { Logger } from '@/log'
import type { ParsedMarkdown } from '@/markdown'
import type {
  CollectedInputContext,
  InputPlugin,
  InputPluginContext,
  PluginOptions,
  YAMLFrontMatter,
} from '@/types'

import * as os from 'node:os'
import * as path from 'node:path'
import {
  DEFAULT_SHADOW_PROJECT_SUFFIX,
  DEFAULT_WORKSPACE_DIR,
  PathPlaceholders,
} from '@/constants'
import { parseMarkdown } from '@/markdown'
import { PluginKind } from '@/types'
import { AbstractPlugin } from './AbstractPlugin'

/**
 * Result of resolving base paths from plugin options.
 */
export interface ResolvedBasePaths {
  /** The resolved workspace directory path */
  readonly workspaceDir: string
  /** The resolved shadow project directory path */
  readonly shadowProjectDir: string
}

/**
 * Abstract base class for input plugins.
 * Provides common functionality for collecting data from the file system.
 *
 * @example
 * ```typescript
 * class MyInputPlugin extends AbstractInputPlugin {
 *   constructor() {
 *     super('MyInputPlugin')
 *   }
 *
 *   collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
 *     const { workspaceDir, shadowProjectDir } = this.resolveBasePaths(ctx.userConfigOptions)
 *     // ... collect data
 *     return { ... }
 *   }
 * }
 * ```
 */
export abstract class AbstractInputPlugin extends AbstractPlugin<PluginKind.Input> implements InputPlugin {
  /**
   * Logger instance inherited from AbstractPlugin.
   * Exposed for compatibility with InputPlugin interface.
   */
  declare readonly log: Logger

  /**
   * Creates a new AbstractInputPlugin instance.
   * Automatically sets the plugin type to PluginKind.Input.
   *
   * @param name - The unique name of the plugin
   * @param dependsOn - Optional array of plugin names this plugin depends on
   */
  protected constructor(name: string, dependsOn?: readonly string[]) {
    super(name, PluginKind.Input, dependsOn)
  }

  /**
   * Collect data from the file system.
   * Subclasses must implement this method to define their collection logic.
   *
   * @param ctx - The input plugin context containing configuration and utilities
   * @returns Partial collected input context with the data gathered by this plugin
   */
  abstract collect(ctx: InputPluginContext): Partial<CollectedInputContext>

  /**
   * Resolve base paths (workspace and shadow project directories) from plugin options.
   * Handles path placeholders like ~, $WORKSPACE, and $SHADOW_PROJECT.
   *
   * @param options - The plugin options containing path configurations
   * @returns Object containing resolved workspaceDir and shadowProjectDir
   *
   * @example
   * ```typescript
   * const { workspaceDir, shadowProjectDir } = this.resolveBasePaths(ctx.userConfigOptions)
   * ```
   */
  protected resolveBasePaths(options: PluginOptions): ResolvedBasePaths {
    const workspaceDirRaw = options.workspaceDir ?? DEFAULT_WORKSPACE_DIR
    const workspaceDir = this.resolvePath(workspaceDirRaw, '', '')

    const shadowProjectDirRaw = options.shadowProjectDir ?? `${PathPlaceholders.WORKSPACE}/${DEFAULT_SHADOW_PROJECT_SUFFIX}`
    const shadowProjectDir = this.resolvePath(shadowProjectDirRaw, workspaceDir, '')

    return { workspaceDir, shadowProjectDir }
  }

  /**
   * Resolve a raw path string by replacing placeholders with actual values.
   * Supports the following placeholders:
   * - `~`: User home directory
   * - `$WORKSPACE`: Workspace directory
   * - `$SHADOW_PROJECT`: Shadow project directory
   *
   * @param rawPath - The raw path string potentially containing placeholders
   * @param workspaceDir - The resolved workspace directory
   * @param shadowProjectDir - The resolved shadow project directory
   * @returns The fully resolved and normalized path
   *
   * @example
   * ```typescript
   * const resolved = this.resolvePath('$SHADOW_PROJECT/dist/skills', workspaceDir, shadowProjectDir)
   * ```
   */
  protected resolvePath(rawPath: string, workspaceDir: string, shadowProjectDir: string): string {
    let resolved = rawPath

    if (resolved.startsWith(PathPlaceholders.USER_HOME)) {
      resolved = resolved.replace(PathPlaceholders.USER_HOME, os.homedir())
    }

    if (resolved.includes(PathPlaceholders.SHADOW_PROJECT)) {
      resolved = resolved.replace(PathPlaceholders.SHADOW_PROJECT, shadowProjectDir)
    }

    if (resolved.includes(PathPlaceholders.WORKSPACE)) {
      resolved = resolved.replace(PathPlaceholders.WORKSPACE, workspaceDir)
    }

    return path.normalize(resolved)
  }

  /**
   * Read a file and parse it as markdown with YAML front matter.
   * Combines file reading and markdown parsing into a single utility method.
   *
   * @template T - The type of the YAML front matter object
   * @param filePath - The absolute path to the markdown file
   * @param fs - The file system module to use for reading
   * @returns Parsed markdown object containing front matter and content
   * @throws Error if the file cannot be read or parsed
   *
   * @example
   * ```typescript
   * const parsed = this.readAndParseMarkdown<MyFrontMatter>(filePath, ctx.fs)
   * const content = parsed.contentWithoutFrontMatter
   * const frontMatter = parsed.yamlFrontMatter
   * ```
   */
  protected readAndParseMarkdown<T extends YAMLFrontMatter>(
    filePath: string,
    fs: typeof import('node:fs'),
  ): ParsedMarkdown<T> {
    const rawContent = fs.readFileSync(filePath, 'utf-8')
    return parseMarkdown<T>(rawContent)
  }
}
