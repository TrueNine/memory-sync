import type { FC } from 'react'
import { useEffect } from 'react'

import { RefreshCw } from 'lucide-react'

import { useConfig } from '@/hooks/useConfig'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

const ConfigPage: FC = () => {
  const { t } = useI18n()
  const { status, load } = useConfig()

  const cwd = '.'

  useEffect(() => {
    load(cwd)
  }, [load])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('config.title')}</h1>
        <button
          type="button"
          onClick={() => load(cwd)}
          disabled={status.kind === 'loading'}
          className={cn(
            'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            'bg-secondary text-secondary-foreground hover:bg-secondary/80',
            'disabled:pointer-events-none disabled:opacity-50',
          )}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', status.kind === 'loading' && 'animate-spin')} />
          {status.kind === 'loading' ? t('config.loading') : t('common.retry')}
        </button>
      </div>

      {status.kind === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          {t('config.loading')}
        </div>
      )}

      {status.kind === 'error' && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{status.message}</p>
        </div>
      )}

      {status.kind === 'loaded' && (
        <div className="rounded-lg border border-border bg-card p-4">
          <pre className="overflow-x-auto whitespace-pre-wrap text-xs font-mono text-card-foreground">
            {JSON.stringify(status.config, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

export default ConfigPage
