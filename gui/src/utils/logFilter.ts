export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

export interface LogEntry {
  readonly timestamp: string
  readonly level: LogLevel
  readonly namespace: string
  readonly message: string
  readonly meta?: Record<string, unknown>
}

/**
 * Severity ranking: error (0) > warn (1) > info (2) > debug (3).
 * Lower number = higher severity.
 */
const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
}

/**
 * Check if a given level meets the minimum severity threshold.
 */
export function isLevelAtLeast(level: LogLevel, minLevel: LogLevel): boolean {
  return LOG_LEVEL_SEVERITY[level] <= LOG_LEVEL_SEVERITY[minLevel]
}

/**
 * Filter log entries by minimum level.
 * Returns only entries whose severity is >= the specified minimum level.
 * Preserves the original order of entries.
 *
 * Pure function — no side effects.
 */
export function filterLogsByLevel(entries: readonly LogEntry[], minLevel: LogLevel): readonly LogEntry[] {
  return entries.filter((entry) => isLevelAtLeast(entry.level, minLevel))
}
