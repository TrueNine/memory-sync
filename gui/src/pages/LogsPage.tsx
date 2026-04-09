import type { FC } from 'react'
import { useMemo, useState } from 'react'

import { MarkdownLogBlock } from '@/components/MarkdownLogBlock'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import type { LogEntry, LogStream } from '@/utils/logFilter'
import { filterLogsByStream } from '@/utils/logFilter'

const streamBadgeStyles: Record<LogStream, string> = {
  stdout: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  stderr: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
}

type FilterOption = LogStream | 'all'

const filterOptions: readonly FilterOption[] = ['all', 'stdout', 'stderr']

const filterLabelKeys: Record<FilterOption, string> = {
  all: 'logs.filter.all',
  stdout: 'logs.filter.stdout',
  stderr: 'logs.filter.stderr',
}

const LogsPage: FC = () => {
  const { t } = useI18n()
  const [filter, setFilter] = useState<FilterOption>('all')

  // TODO: replace with real log entries from pipeline execution / event listener
  const [logs] = useState<readonly LogEntry[]>([])

  const filteredLogs = useMemo(() => {
    if (filter === 'all') return logs
    return filterLogsByStream(logs, filter)
  }, [logs, filter])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('logs.title')}</h1>
      </div>

      {/* Stream Filter */}
      <div className="flex gap-1 rounded-lg border border-border bg-muted p-1">
        {filterOptions.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => setFilter(opt)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              filter === opt
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(filterLabelKeys[opt])}
          </button>
        ))}
      </div>

      {/* Log Entries */}
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
        {filteredLogs.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">
            {logs.length === 0 ? 'No log entries yet.' : 'No entries match the selected filter.'}
          </p>
        ) : (
          filteredLogs.map((entry, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-3"
            >
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={cn(
                    'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-medium uppercase tracking-wide',
                    streamBadgeStyles[entry.stream],
                  )}
                >
                  {entry.stream}
                </span>
                {entry.source != null && entry.source.length > 0 ? (
                  <span className="text-muted-foreground">{entry.source}</span>
                ) : null}
              </div>
              <MarkdownLogBlock markdown={entry.markdown} />
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default LogsPage
