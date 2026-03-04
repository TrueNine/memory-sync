import type {GlobalConfigDirectoryType} from './enums'
import type {AbsolutePath, RelativePath} from './FileSystemTypes'
import type {SubAgentPrompt} from './InputTypes'

/**
 * Global configuration based on user_home root directory
 */
export interface GlobalConfigDirectoryInUserHome<K = GlobalConfigDirectoryType.UserHome> {
  readonly type: K
  readonly directory: RelativePath
}

/**
 * Special, absolute path global memory prompt
 */
export interface GlobalConfigDirectoryInOther<K = GlobalConfigDirectoryType.External> {
  readonly type: K
  readonly directory: AbsolutePath
}

export type GlobalConfigDirectory<K = GlobalConfigDirectoryType> = GlobalConfigDirectoryInUserHome<K> | GlobalConfigDirectoryInOther<K>

export interface Target {

}

/**
 * SubAgent frontmatter field mapping
 * Value can be a static string or a function that extracts value from SubAgentPrompt
 */
export type SubAgentFrontMatterField = string | ((subAgent: SubAgentPrompt) => unknown)

/**
 * SubAgent output configuration for declarative configuration
 */
export interface SubAgentOutputConfig {
  /** Whether SubAgent output is enabled */
  readonly enabled: boolean

  /** Output subdirectory name (relative to IDE config directory) */
  readonly subDir?: string

  /** File name format template */
  readonly fileNameTemplate?: 'prefix-agent' | 'prefix_agent' | 'agent' | string

  /** Whether to include series prefix */
  readonly includeSeriesPrefix?: boolean

  /** Series prefix separator */
  readonly seriesSeparator?: string

  /** Frontmatter configuration */
  readonly frontMatter?: {
    /** Whether to add frontmatter */
    readonly enabled: boolean
    /** Custom field mappings */
    readonly fields?: Record<string, SubAgentFrontMatterField>
    /** Fields to exclude */
    readonly exclude?: string[]
  }

  /** Content transformation options */
  readonly contentTransform?: {
    /** Whether to transform MDX references to Markdown */
    readonly transformMdxRefs?: boolean
    /** Custom content processor */
    readonly processor?: (content: string, subAgent: SubAgentPrompt) => string
  }
}
