import type { FC } from 'react'
import { useEffect, useState } from 'react'

import { RefreshCw } from 'lucide-react'

import type { PluginExecutionResult } from '@/api/bridge'
import { listPlugins } from '@/api/bridge'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

const PluginsPage: FC = () => {
  const { t } = useI18n()
  const [plugins, setPlugins] = useState<readonly PluginExecutionResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cwd = '.'

  const fetchPlugins = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await listPlugins(cwd)
      setPlugins(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPlugins()
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('plugins.title')}</h1>
        <button
          type="button"
          onClick={fetchPlugins}
          disabled={loading}
          className={cn(
            'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            'bg-secondary text-secondary-foreground hover:bg-secondary/80',
            'disabled:pointer-events-none disabled:opacity-50',
          )}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {plugins.map((plugin) => (
          <div
            key={plugin.plugin}
            className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
          >
            <span className="truncate text-sm font-medium text-card-foreground" title={plugin.plugin}>{plugin.plugin}</span>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{plugin.files} files</span>
              <span>{plugin.dirs} dirs</span>
              {plugin.dryRun && (
                <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                  dry-run
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {plugins.length === 0 && !loading && !error && (
        <p className="text-sm text-muted-foreground">No plugins found.</p>
      )}
    </div>
  )
}

export default PluginsPage
