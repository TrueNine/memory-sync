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
 * Fetch latest version from npm registry
 */
export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const response = await fetch(NPM_REGISTRY_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) {
      return null
    }
    const data = await response.json() as { version?: string }
    return data.version ?? null
  } catch {
    return null
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

  const remoteVersion = await fetchLatestVersion()

  if (remoteVersion == null) {
    return {
      status: 'current',
      localVersion,
      remoteVersion: null,
      error: 'Failed to fetch remote version',
    }
  }

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
        logger.debug(`Version check skipped: ${result.error}`)
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
    // Only log warnings for outdated versions on startup
    if (result.status === 'outdated') {
      logVersionCheckResult(result, logger)
    }
  } catch {
    // Silently ignore errors during startup check
  }
}
