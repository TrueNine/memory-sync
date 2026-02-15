import type { FC } from 'react'
import { useMemo, useState } from 'react'

import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import type { LogEntry, LogLevel } from '@/utils/logFilter'
import { filterLogsByLevel } from '@/utils/logFilter'

const levelBadgeStyles: Record<LogLevel, string> = {
  error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  warn: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  debug: 'bg-gray-100 text-gray-800 dark:bg-gray-700/30 dark:text-gray-400',
}

type FilterOption = LogLevel | 'all'

const filterOptions: readonly FilterOption[] = ['all', 'error', 'warn', 'info', 'debug']

const filterLabelKeys: Record<FilterOption, string> = {
  all: 'logs.filter.all',
  error: 'logs.filter.error',
  warn: 'logs.filter.warn',
  info: 'logs.filter.info',
  debug: 'logs.filter.debug',
}

const LogsPage: FC = () => {
  const { t } = useI18n()
  const [filter, setFilter] = useState<FilterOption>('all')

  // TODO: replace with real log entries from pipeline execution / event listener
  const [logs] = useState<readonly LogEntry[]>([])

  const filteredLogs = useMemo(() => {
    if (filter === 'all') return logs
    return filterLogsByLevel(logs, filter)
  }, [logs, filter])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('logs.title')}</h1>
      </div>

      {/* Level Filter */}
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
      <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-2 font-mono text-xs">
        {filteredLogs.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">
            {logs.length === 0 ? 'No log entries yet.' : 'No entries match the selected filter.'}
          </p>
        ) : (
          filteredLogs.map((entry, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded px-2 py-1 hover:bg-muted/50"
            >
              <span className="shrink-0 text-muted-foreground">{entry.timestamp}</span>
              <span
                className={cn(
                  'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-xs font-medium',
                  levelBadgeStyles[entry.level],
                )}
              >
                {entry.level.toUpperCase()}
              </span>
              <span className="shrink-0 text-muted-foreground">[{entry.namespace}]</span>
              <span className="break-all text-card-foreground">{entry.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default LogsPage
