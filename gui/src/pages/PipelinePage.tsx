import type { FC } from 'react'
import { useEffect, useState } from 'react'

import { Eye, Play } from 'lucide-react'

import type { PluginExecutionResult } from '@/api/bridge'
import { listPlugins } from '@/api/bridge'
import { usePipeline } from '@/hooks/usePipeline'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

const PipelinePage: FC = () => {
  const { t } = useI18n()
  const { status, execute, dryRun, reset } = usePipeline()
  const [plugins, setPlugins] = useState<readonly PluginExecutionResult[]>([])

  const cwd = '.'

  useEffect(() => {
    listPlugins(cwd).then(setPlugins).catch(() => {})
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('nav.pipeline')}</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => execute(cwd)}
            disabled={status.kind === 'running'}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              'bg-primary text-primary-foreground hover:bg-primary/90',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            <Play className="h-3.5 w-3.5" />
            {t('pipeline.execute')}
          </button>
          <button
            type="button"
            onClick={() => dryRun(cwd)}
            disabled={status.kind === 'running'}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              'bg-secondary text-secondary-foreground hover:bg-secondary/80',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            <Eye className="h-3.5 w-3.5" />
            {t('pipeline.dryRun')}
          </button>
        </div>
      </div>

      {/* Registered Plugins */}
      {plugins.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">{t('plugins.title')}</h2>
          <div className="flex flex-wrap gap-2">
            {plugins.map((p) => (
              <span
                key={p.plugin}
                className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-900/30 dark:text-purple-400"
              >
                {p.plugin} ({p.files})
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Execution Status */}
      <section className="flex flex-col gap-3">
        {status.kind === 'running' && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-4">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm">{t('pipeline.status.running')}</span>
          </div>
        )}

        {status.kind === 'completed' && (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  {t('pipeline.status.completed')}
                </span>
                <span className="text-xs text-muted-foreground">
                  {status.result.totalFiles} files, {status.result.totalDirs} dirs
                </span>
              </div>
              <button type="button" onClick={reset} className="text-xs text-primary hover:underline">
                {t('common.confirm')}
              </button>
            </div>

            {/* Plugin Results */}
            {status.result.pluginResults.length > 0 && (
              <div className="flex flex-col gap-2">
                {status.result.pluginResults.map((pr) => (
                  <div key={pr.plugin} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <span className="text-sm font-medium">{pr.plugin}</span>
                    <span className="text-xs text-muted-foreground">{pr.files} files</span>
                  </div>
                ))}
              </div>
            )}

            {/* Errors */}
            {status.result.errors.length > 0 && (
              <div className="flex flex-col gap-1 rounded-md bg-destructive/10 p-3">
                {status.result.errors.map((err, i) => (
                  <p key={i} className="text-xs text-destructive">{err}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {status.kind === 'error' && (
          <div className="flex flex-col gap-2 rounded-lg border border-destructive/50 bg-card p-4">
            <span className="inline-flex self-start items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-400">
              {t('pipeline.status.error')}
            </span>
            <p className="text-sm text-destructive">{status.message}</p>
            <button type="button" onClick={reset} className="self-start text-xs text-primary hover:underline">
              {t('common.retry')}
            </button>
          </div>
        )}

        {status.kind === 'idle' && (
          <p className="text-sm text-muted-foreground">{t('pipeline.status.idle')}</p>
        )}
      </section>
    </div>
  )
}

export default PipelinePage
