/**
 * Registry Configuration Writer Types
 *
 * Type definitions for registry data structures used by output plugins
 * to register their outputs in external tool registry files.
 *
 * @see Requirements 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.5
 */

/**
 * Generic registry data structure.
 * All registry files must have version and lastUpdated fields.
 *
 * @see Requirements 1.8
 */
export interface RegistryData {
  readonly version: string
  readonly lastUpdated: string
}

/**
 * Result of a registry operation.
 *
 * @see Requirements 5.4
 */
export interface RegistryOperationResult {
  readonly success: boolean
  readonly entryName: string
  readonly error?: Error
}

/**
 * Source information for a Kiro power.
 * Indicates the origin type of a registered power.
 *
 * @see Requirements 3.1, 3.2
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
 *
 * Field order matches Kiro's expected format:
 * name → description → mcpServers → author → keywords → displayName → installed → installedAt → installPath → source → sourcePath
 *
 * @see Requirements 2.1, 2.2, 2.3, 2.4
 */
export interface KiroPowerEntry {
  readonly name: string
  readonly description: string
  /**
   * MCP server names from skill's mcp.json configuration.
   * Contains all keys from mcpServers object.
   * Position: after description, before author (matches Kiro format)
   */
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
 *
 * @see Requirements 3.1, 3.2, 3.3, 3.5
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
 *
 * @see Requirements 4.5, 4.6
 */
export interface KiroRecommendedRepo {
  readonly url: string
  readonly lastFetch: string
  readonly powerCount: number
}

/**
 * Complete Kiro powers registry structure.
 * Represents the full ~/.kiro/powers/registry.json file.
 *
 * @see Requirements 4.1, 4.2
 */
export interface KiroPowersRegistry extends RegistryData {
  readonly powers: Record<string, KiroPowerEntry>
  readonly repoSources: Record<string, KiroRepoSource>
  readonly kiroRecommendedRepo?: KiroRecommendedRepo
}
