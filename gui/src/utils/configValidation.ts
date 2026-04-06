/**
 * Config validation for the UI frontend.
 *
 * Replicates the validation logic from the sdk config loader
 * (`sdk/src/ConfigLoader.ts`) so the webview can validate
 * config objects before saving — without importing from the sdk package
 * directly (different runtime context).
 */

export type ValidationSeverity = 'error' | 'warning'

export interface ValidationError {
  /** Dot-separated path to the offending field, e.g. "workspaceDir" */
  readonly field: string
  /** Human-readable description of the problem */
  readonly message: string
  /** Whether this is a hard error or a soft warning (e.g. unknown field) */
  readonly severity: ValidationSeverity
}

/**
 * All fields that the user config schema recognises.
 * Used to detect unknown / extra keys.
 */
const KNOWN_FIELDS: ReadonlySet<string> = new Set([
  'version',
  'workspaceDir',
  'logLevel',
  'commandSeriesOptions',
  'outputScopes',
  'frontMatter',
  'codeStyles',
  'cleanupProtection',
  'windows',
  'profile',
  'plugins',
])

const VALID_LOG_LEVELS: ReadonlySet<string> = new Set([
  'trace',
  'debug',
  'info',
  'warn',
  'error',
])

const VALID_INDENT_STYLES: ReadonlySet<string> = new Set([
  'tab',
  'space',
])

const SUPPORTED_PLUGIN_KEYS = [
  'agentsMd',
  'claudeCode',
  'codex',
  'cursor',
  'droid',
  'gemini',
  'git',
  'jetbrains',
  'jetbrainsCodeStyle',
  'kiro',
  'opencode',
  'qoder',
  'readme',
  'trae',
  'traeCn',
  'vscode',
  'warp',
  'windsurf',
  'zed',
] as const

const SUPPORTED_PLUGIN_KEY_SET: ReadonlySet<string> = new Set(SUPPORTED_PLUGIN_KEYS)
const SUPPORTED_PLUGIN_KEYS_MESSAGE = SUPPORTED_PLUGIN_KEYS.join(', ')

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validateObjectField(
  obj: Record<string, unknown>,
  field: string,
  errors: ValidationError[]
): Record<string, unknown> | undefined {
  if (!(field in obj)) return void 0

  const value = obj[field]
  if (!isPlainObject(value)) {
    errors.push({ field, message: `${field} must be an object`, severity: 'error' })
    return void 0
  }

  return value
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

  if (!isPlainObject(raw)) {
    errors.push({ field: '', message: 'Config must be a plain object', severity: 'error' })
    return errors
  }

  const obj = raw

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
  validateObjectField(obj, 'profile', errors)

  // ── commandSeriesOptions / outputScopes / frontMatter / cleanupProtection / windows / plugins ──
  validateObjectField(obj, 'commandSeriesOptions', errors)
  validateObjectField(obj, 'outputScopes', errors)
  validateObjectField(obj, 'frontMatter', errors)
  validateObjectField(obj, 'cleanupProtection', errors)
  validateObjectField(obj, 'windows', errors)
  const plugins = validateObjectField(obj, 'plugins', errors)
  if (plugins != null) {
    for (const [pluginName, enabled] of Object.entries(plugins)) {
      if (!SUPPORTED_PLUGIN_KEY_SET.has(pluginName)) {
        errors.push({
          field: `plugins.${pluginName}`,
          message: `Unsupported plugins key "${pluginName}". Supported keys: ${SUPPORTED_PLUGIN_KEYS_MESSAGE}`,
          severity: 'error',
        })
        continue
      }

      if (typeof enabled !== 'boolean') {
        errors.push({
          field: `plugins.${pluginName}`,
          message: `plugins.${pluginName} must be a boolean`,
          severity: 'error',
        })
      }
    }
  }

  // ── codeStyles ───────────────────────────────────────────────────────
  const codeStyles = validateObjectField(obj, 'codeStyles', errors)
  if (codeStyles != null) {
    if ('indent' in codeStyles) {
      const indent = codeStyles['indent']
      if (typeof indent !== 'string' || !VALID_INDENT_STYLES.has(indent)) {
        errors.push({
          field: 'codeStyles.indent',
          message: `codeStyles.indent must be one of: ${[...VALID_INDENT_STYLES].join(', ')}`,
          severity: 'error',
        })
      }
    }

    if ('tabSize' in codeStyles) {
      const tabSize = codeStyles['tabSize']
      if (
        typeof tabSize !== 'number'
        || !Number.isInteger(tabSize)
        || tabSize <= 0
      ) {
        errors.push({
          field: 'codeStyles.tabSize',
          message: 'codeStyles.tabSize must be a positive integer',
          severity: 'error',
        })
      }
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
