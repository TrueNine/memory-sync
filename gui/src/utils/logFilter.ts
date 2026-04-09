export type LogStream = 'stdout' | 'stderr'

export interface LogEntry {
  readonly stream: LogStream
  readonly source?: string
  readonly markdown: string
}

export function isMatchingStream(stream: LogStream, filter: LogStream): boolean {
  return stream === filter
}

/**
 * Filter log entries by output stream.
 * Returns only entries whose stream matches the selected filter.
 * Preserves the original order of entries.
 *
 * Pure function — no side effects.
 */
export function filterLogsByStream(entries: readonly LogEntry[], filter: LogStream): readonly LogEntry[] {
  return entries.filter((entry) => isMatchingStream(entry.stream, filter))
}
