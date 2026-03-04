import type {GlobalConfigDirectoryType} from './enums'
import type {SubAgentPrompt} from './InputTypes'
import type {AbsolutePath, RelativePath} from './PromptTypes'

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

/**
 * Generic registry data structure.
 * All registry files must have version and lastUpdated fields.
 */
export interface RegistryData {
  readonly version: string
  readonly lastUpdated: string
}

/**
 * Result of a registry operation.
 */
export interface RegistryOperationResult {
  readonly success: boolean
  readonly entryName: string
  readonly error?: Error
}

/**
 * Source information for a Kiro power.
 * Indicates the origin type of a registered power.
 */
export interface KiroPowerSource {
  readonly type: 'local' | 'repo' | 'registry'
  readonly repoId?: string
  readonly repoName?: string
  readonly cloneId?: string
}

/**
 * A single power entry in the Kiro registry.
 * Contains metadata about an installed power.
 */
export interface KiroPowerEntry {
  readonly name: string
  readonly description: string
  readonly mcpServers?: readonly string[]
  readonly author?: string
  readonly keywords: readonly string[]
  readonly displayName?: string
  readonly installed: boolean
  readonly installedAt?: string
  readonly installPath?: string
  readonly source: KiroPowerSource
  readonly sourcePath?: string
}

/**
 * Repository source tracking in Kiro registry.
 * Tracks the source/origin of registered items.
 */
export interface KiroRepoSource {
  readonly name: string
  readonly type: 'local' | 'git'
  readonly enabled: boolean
  readonly addedAt?: string
  readonly powerCount: number
  readonly path?: string
  readonly lastSync?: string
  readonly powers?: readonly string[]
}

/**
 * Kiro recommended repo metadata (preserved during updates).
 */
export interface KiroRecommendedRepo {
  readonly url: string
  readonly lastFetch: string
  readonly powerCount: number
}

/**
 * Complete Kiro powers registry structure.
 * Represents the full ~/.kiro/powers/registry.json file.
 */
export interface KiroPowersRegistry extends RegistryData {
  readonly powers: Record<string, KiroPowerEntry>
  readonly repoSources: Record<string, KiroRepoSource>
  readonly kiroRecommendedRepo?: KiroRecommendedRepo
}
