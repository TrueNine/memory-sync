import type { FC } from 'react'

import { Eye, Play, Trash2 } from 'lucide-react'

import { usePipeline } from '@/hooks/usePipeline'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

const DashboardPage: FC = () => {
  const { t } = useI18n()
  const { status, execute, clean, dryRun, reset } = usePipeline()

  // TODO: replace with actual cwd from app state
  const cwd = '.'

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t('nav.dashboard')}</h1>

      {/* Quick Actions */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {t('pipeline.execute')}
        </h2>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => execute(cwd)}
            disabled={status.kind === 'running'}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              'bg-primary text-primary-foreground hover:bg-primary/90',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            <Play className="h-4 w-4" />
            {t('pipeline.execute')}
          </button>

          <button
            type="button"
            onClick={() => clean(cwd)}
            disabled={status.kind === 'running'}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              'bg-destructive text-destructive-foreground hover:bg-destructive/90',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            <Trash2 className="h-4 w-4" />
            {t('pipeline.clean')}
          </button>

          <button
            type="button"
            onClick={() => dryRun(cwd)}
            disabled={status.kind === 'running'}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              'bg-secondary text-secondary-foreground hover:bg-secondary/80',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            <Eye className="h-4 w-4" />
            {t('pipeline.dryRun')}
          </button>
        </div>
      </section>

      {/* Pipeline Status */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {t('pipeline.status.idle')}
        </h2>

        <div className="rounded-lg border border-border bg-card p-4 text-card-foreground">
          {status.kind === 'idle' && (
            <p className="text-sm text-muted-foreground">{t('pipeline.status.idle')}</p>
          )}

          {status.kind === 'running' && (
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm">{t('pipeline.status.running')}</p>
              {status.currentPlugin && (
                <span className="text-xs text-muted-foreground">— {status.currentPlugin}</span>
              )}
            </div>
          )}

          {status.kind === 'completed' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  {t('pipeline.status.completed')}
                </span>
                <span className="text-xs text-muted-foreground">
                  {status.result.totalFiles} files, {status.result.totalDirs} dirs
                </span>
              </div>
              {status.result.command && (
                <p className="text-sm text-muted-foreground">{status.result.command}</p>
              )}
              <button
                type="button"
                onClick={reset}
                className="self-start text-xs text-primary underline-offset-4 hover:underline"
              >
                {t('common.confirm')}
              </button>
            </div>
          )}

          {status.kind === 'error' && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-400">
                  {t('pipeline.status.error')}
                </span>
              </div>
              <p className="text-sm text-destructive">{status.message}</p>
              <button
                type="button"
                onClick={reset}
                className="self-start text-xs text-primary underline-offset-4 hover:underline"
              >
                {t('common.retry')}
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export default DashboardPage
