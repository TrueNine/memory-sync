/**
 * Configuration for empty directory cleanup in aindex projects.
 */
export interface AindexEmptyDirCleanupConfig {
  /** Git-style glob patterns to exclude from empty directory cleanup. */
  readonly exclude?: readonly string[]
}

/**
 * Project-level configuration for aindex.
 * This is loaded from aindex/aindex.config.ts
 */
export interface AindexProjectConfig {
  readonly emptyDirCleanup?: AindexEmptyDirCleanupConfig
}

export interface AindexProjectConfigLoadResult {
  readonly config: AindexProjectConfig
  readonly source: string | null
  readonly found: boolean
}

export const DEFAULT_EMPTY_DIR_CLEANUP_CONFIG: AindexEmptyDirCleanupConfig = {
  exclude: []
}

export function defineAindexProjectConfig(config: AindexProjectConfig): AindexProjectConfig {
  return config
}
