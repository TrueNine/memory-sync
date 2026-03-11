/**
 * Config validation for the UI frontend.
 *
 * Replicates the validation logic from Core_CLI's `validateConfigStrict`
 * (memory-sync-cli/src/ConfigLoader.ts) so the webview can validate
 * config objects before saving — without importing from the CLI package
 * directly (different runtime context).
 */

export type ValidationSeverity = 'error' | 'warning'

export interface ValidationError {
  /** Dot-separated path to the offending field, e.g. "aindex.skills.src" */
  readonly field: string
  /** Human-readable description of the problem */
  readonly message: string
  /** Whether this is a hard error or a soft warning (e.g. unknown field) */
  readonly severity: ValidationSeverity
}

/**
 * All fields that the CLI config schema recognises.
 * Used to detect unknown / extra keys.
 */
const KNOWN_FIELDS: ReadonlySet<string> = new Set([
  'version',
  'workspaceDir',
  'aindex',
  'logLevel',
  'commandSeriesOptions',
  'outputScopes',
  'profile',
])

const VALID_LOG_LEVELS: ReadonlySet<string> = new Set([
  'trace',
  'debug',
  'info',
  'warn',
  'error',
])

const AINDEX_PAIR_KEYS = [
  'skills',
  'commands',
  'subAgents',
  'rules',
  'globalPrompt',
  'workspacePrompt',
  'app',
  'ext',
  'arch',
] as const

/**
 * Validate a { src, dist } pair object
 */
function validateDirPair(value: unknown, fieldPath: string): ValidationError[] {
  const errors: ValidationError[] = []
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    errors.push({field: fieldPath, message: `${fieldPath} must be an object with "src" and "dist" string fields`, severity: 'error'})
    return errors
  }
  const pair = value as Record<string, unknown>
  if (!('src' in pair) || typeof pair['src'] !== 'string') {
    errors.push({field: `${fieldPath}.src`, message: `${fieldPath}.src must be a string`, severity: 'error'})
  }
  if (!('dist' in pair) || typeof pair['dist'] !== 'string') {
    errors.push({field: `${fieldPath}.dist`, message: `${fieldPath}.dist must be a string`, severity: 'error'})
  }
  return errors
}

/**
 * Validate a raw config object and return all validation issues.
 *
 * @param raw - The config object to validate (typically parsed from JSON).
 * @returns An array of {@link ValidationError} items. An empty array means
 *          the config is valid.
 */
export function validateConfig(raw: unknown): readonly ValidationError[] {
  const errors: ValidationError[] = []

  // ── Guard: must be a non-null, non-array object ──────────────────────
  if (raw === null || raw === undefined) {
    errors.push({ field: '', message: 'Config must be a non-null object', severity: 'error' })
    return errors
  }

  if (typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push({ field: '', message: 'Config must be a plain object', severity: 'error' })
    return errors
  }

  const obj = raw as Record<string, unknown>

  // ── Unknown / extra fields → warnings ────────────────────────────────
  for (const key of Object.keys(obj)) {
    if (!KNOWN_FIELDS.has(key)) {
      errors.push({
        field: key,
        message: `Unknown config field "${key}"`,
        severity: 'warning',
      })
    }
  }

  // ── version ──────────────────────────────────────────────────────────
  if ('version' in obj && typeof obj['version'] !== 'string') {
    errors.push({ field: 'version', message: 'version must be a string', severity: 'error' })
  }

  // ── workspaceDir ─────────────────────────────────────────────────────
  if ('workspaceDir' in obj && typeof obj['workspaceDir'] !== 'string') {
    errors.push({ field: 'workspaceDir', message: 'workspaceDir must be a string', severity: 'error' })
  }

  // ── aindex ──────────────────────────────────────────────
  if ('aindex' in obj) {
    const ssp = obj['aindex']
    if (typeof ssp !== 'object' || ssp === null || Array.isArray(ssp)) {
      errors.push({ field: 'aindex', message: 'aindex must be an object', severity: 'error' })
    } else {
      const sspObj = ssp as Record<string, unknown>
      // Validate dir field (optional string)
      if ('dir' in sspObj && typeof sspObj['dir'] !== 'string') {
        errors.push({ field: 'aindex.dir', message: 'aindex.dir must be a string', severity: 'error' })
      }
      for (const key of AINDEX_PAIR_KEYS) {
        if (key in sspObj) {
          errors.push(...validateDirPair(sspObj[key], `aindex.${key}`))
        }
      }
    }
  }

  // ── logLevel ─────────────────────────────────────────────────────────
  if ('logLevel' in obj) {
    const v = obj['logLevel']
    if (typeof v !== 'string' || !VALID_LOG_LEVELS.has(v)) {
      errors.push({
        field: 'logLevel',
        message: `logLevel must be one of: ${[...VALID_LOG_LEVELS].join(', ')}`,
        severity: 'error',
      })
    }
  }

  // ── profile ──────────────────────────────────────────────────────────
  if ('profile' in obj) {
    const v = obj['profile']
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      errors.push({ field: 'profile', message: 'profile must be an object', severity: 'error' })
    }
  }

  // ── commandSeriesOptions ─────────────────────────────────────────────
  if ('commandSeriesOptions' in obj) {
    const v = obj['commandSeriesOptions']
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      errors.push({
        field: 'commandSeriesOptions',
        message: 'commandSeriesOptions must be an object',
        severity: 'error',
      })
    }
  }

  // ── outputScopes ─────────────────────────────────────────────────────
  if ('outputScopes' in obj) {
    const v = obj['outputScopes']
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      errors.push({
        field: 'outputScopes',
        message: 'outputScopes must be an object',
        severity: 'error',
      })
    }
  }

  return errors
}

/**
 * Convenience helper — returns `true` when the config has zero *errors*
 * (warnings are acceptable).
 */
export function isConfigValid(raw: unknown): boolean {
  return validateConfig(raw).filter((e) => e.severity === 'error').length === 0
}
