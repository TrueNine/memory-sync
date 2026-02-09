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
  /** Dot-separated path to the offending field, e.g. "excludePatterns.foo" */
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
  'workspaceDir',
  'shadowSourceProjectDir',
  'shadowSkillSourceDir',
  'shadowFastCommandDir',
  'shadowSubAgentDir',
  'globalMemoryFile',
  'shadowProjectsDir',
  'externalProjects',
  'excludePatterns',
  'logLevel',
  'fastCommandSeriesOptions',
  'profile',
  'tool',
])

/** String-typed directory / path fields */
const STRING_FIELDS = [
  'workspaceDir',
  'shadowSourceProjectDir',
  'shadowSkillSourceDir',
  'shadowFastCommandDir',
  'shadowSubAgentDir',
  'globalMemoryFile',
  'shadowProjectsDir',
] as const

const VALID_LOG_LEVELS: ReadonlySet<string> = new Set([
  'trace',
  'debug',
  'info',
  'warn',
  'error',
])

/**
 * Validate a raw config object and return all validation issues.
 *
 * The function mirrors Core_CLI's `validateConfigStrict` but additionally
 * produces *warnings* for unknown top-level keys so the UI can surface
 * them without blocking a save.
 *
 * @param raw - The config object to validate (typically parsed from JSON).
 *              Accepts `unknown` so callers don't need to pre-cast.
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

  // ── String fields ────────────────────────────────────────────────────
  for (const field of STRING_FIELDS) {
    if (field in obj && typeof obj[field] !== 'string') {
      errors.push({ field, message: `${field} must be a string`, severity: 'error' })
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

  // ── externalProjects ─────────────────────────────────────────────────
  if ('externalProjects' in obj) {
    const v = obj['externalProjects']
    if (!Array.isArray(v)) {
      errors.push({ field: 'externalProjects', message: 'externalProjects must be an array', severity: 'error' })
    } else if (!v.every((p) => typeof p === 'string')) {
      errors.push({
        field: 'externalProjects',
        message: 'externalProjects must be an array of strings',
        severity: 'error',
      })
    }
  }

  // ── excludePatterns ──────────────────────────────────────────────────
  if ('excludePatterns' in obj) {
    const v = obj['excludePatterns']
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      errors.push({ field: 'excludePatterns', message: 'excludePatterns must be an object', severity: 'error' })
    } else {
      const patterns = v as Record<string, unknown>
      for (const [key, value] of Object.entries(patterns)) {
        if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
          errors.push({
            field: `excludePatterns.${key}`,
            message: `excludePatterns.${key} must be an array of strings`,
            severity: 'error',
          })
        }
      }
    }
  }

  // ── profile ──────────────────────────────────────────────────────────
  if ('profile' in obj) {
    const v = obj['profile']
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      errors.push({ field: 'profile', message: 'profile must be an object', severity: 'error' })
    }
  }

  // ── tool ─────────────────────────────────────────────────────────────
  if ('tool' in obj) {
    const v = obj['tool']
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      errors.push({ field: 'tool', message: 'tool must be an object', severity: 'error' })
    } else {
      const toolObj = v as Record<string, unknown>
      for (const [key, value] of Object.entries(toolObj)) {
        if (typeof value !== 'string' && value !== undefined) {
          errors.push({
            field: `tool.${key}`,
            message: `tool.${key} must be a string`,
            severity: 'error',
          })
        }
      }
    }
  }

  // ── fastCommandSeriesOptions ─────────────────────────────────────────
  if ('fastCommandSeriesOptions' in obj) {
    const v = obj['fastCommandSeriesOptions']
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      errors.push({
        field: 'fastCommandSeriesOptions',
        message: 'fastCommandSeriesOptions must be an object',
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
