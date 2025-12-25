import type { ILogger } from '@/log'

const NPM_REGISTRY_URL = 'https://registry.npmjs.org/@truenine/memory-sync-cli/latest'
const PACKAGE_NAME = '@truenine/memory-sync-cli'

/**
 * Version comparison result
 */
export type VersionStatus = 'outdated' | 'current' | 'development'

export interface VersionCheckResult {
  readonly status: VersionStatus
  readonly localVersion: string
  readonly remoteVersion: string | null
  readonly error?: string
}

/**
 * Parse semver version string into numeric components
 * Returns [major, minor, patch] or null if invalid
 */
export function parseVersion(version: string): [number, number, number] | null {
  // Remove leading 'v' if present
  const cleaned = version.replace(/^v/, '')
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(cleaned)
  if (match == null) {
    return null
  }
  return [
    Number.parseInt(match[1]!, 10),
    Number.parseInt(match[2]!, 10),
    Number.parseInt(match[3]!, 10),
  ]
}

/**
 * Compare two semver versions
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const parsedA = parseVersion(a)
  const parsedB = parseVersion(b)

  if (parsedA == null || parsedB == null) {
    return 0
  }

  for (let i = 0; i < 3; i++) {
    if (parsedA[i]! < parsedB[i]!) {
      return -1
    }
    if (parsedA[i]! > parsedB[i]!) {
      return 1
    }
  }
  return 0
}

/**
 * Timeout duration for fetching version (3 seconds)
 */
const FETCH_TIMEOUT_MS = 3000

/**
 * Fetch latest version from npm registry
 * Returns version string on success, or error message on failure
 */
export async function fetchLatestVersion(): Promise<{ version: string } | { error: string }> {
  try {
    const response = await fetch(NPM_REGISTRY_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!response.ok) {
      return { error: `HTTP ${response.status}: ${response.statusText}` }
    }
    const data = await response.json() as { version?: string }
    if (data.version == null) {
      return { error: 'Invalid response: missing version field' }
    }
    return { version: data.version }
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        return { error: `Request timeout after ${FETCH_TIMEOUT_MS}ms` }
      }
      return { error: err.message }
    }
    return { error: 'Unknown network error' }
  }
}

/**
 * Get local CLI version
 */
export function getLocalVersion(): string {
  return typeof __CLI_VERSION__ !== 'undefined' ? __CLI_VERSION__ : 'dev'
}

/**
 * Check if current version is outdated compared to npm registry
 */
export async function checkVersion(): Promise<VersionCheckResult> {
  const localVersion = getLocalVersion()

  // Development version, skip check
  if (localVersion === 'dev') {
    return {
      status: 'development',
      localVersion,
      remoteVersion: null,
    }
  }

  const fetchResult = await fetchLatestVersion()

  if ('error' in fetchResult) {
    return {
      status: 'current',
      localVersion,
      remoteVersion: null,
      error: fetchResult.error,
    }
  }

  const remoteVersion = fetchResult.version
  const comparison = compareVersions(localVersion, remoteVersion)

  if (comparison < 0) {
    return { status: 'outdated', localVersion, remoteVersion }
  }
  if (comparison > 0) {
    return { status: 'development', localVersion, remoteVersion }
  }
  return { status: 'current', localVersion, remoteVersion }
}

/**
 * Log version check result
 */
export function logVersionCheckResult(result: VersionCheckResult, logger: ILogger): void {
  const { status, localVersion, remoteVersion } = result

  switch (status) {
    case 'outdated':
      logger.warn(
        `Version outdated: ${localVersion} → ${remoteVersion}. Run 'npm i -g ${PACKAGE_NAME}@latest' to update.`,
      )
      break
    case 'current':
      if (result.error != null) {
        logger.error(`Version check failed: ${result.error}`)
      } else {
        logger.info(`Version ${localVersion} is up to date.`)
      }
      break
    case 'development':
      if (remoteVersion != null) {
        logger.info(`Development version detected: ${localVersion} > ${remoteVersion}. Thanks for contributing!`)
      } else {
        logger.debug('Running in development mode, version check skipped.')
      }
      break
  }
}

/**
 * Check if version check should run based on current time
 * Returns true if current minute is even (0, 2, 4, ..., 58)
 */
export function shouldCheckVersion(): boolean {
  const minute = new Date().getMinutes()
  return minute % 2 === 0
}

/**
 * Perform version check on CLI startup if conditions are met
 */
export async function startupVersionCheck(logger: ILogger): Promise<void> {
  if (!shouldCheckVersion()) {
    return
  }

  try {
    const result = await checkVersion()
    // Log warnings for outdated versions or errors on startup
    if (result.status === 'outdated' || result.error != null) {
      logVersionCheckResult(result, logger)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    logger.error(`Version check failed: ${message}`)
  }
}
