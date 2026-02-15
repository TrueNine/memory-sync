import type { FC } from 'react'

import { AlertTriangle, RefreshCw, Terminal } from 'lucide-react'

import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

interface CliMissingBannerProps {
  readonly error?: string
  readonly onRetry: () => void
  readonly checking: boolean
}

const CliMissingBanner: FC<CliMissingBannerProps> = ({ error, onRetry, checking }) => {
  const { t } = useI18n()

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="flex max-w-lg flex-col items-center gap-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">{t('cli.missing.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('cli.missing.description')}
          </p>
        </div>

        <div className="w-full rounded-lg border border-border bg-muted/50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Terminal className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              {t('cli.missing.install')}
            </span>
          </div>
          <code className="block rounded bg-background px-3 py-2 text-sm font-mono select-all">
            npm install -g @truenine/memory-sync-cli
          </code>
        </div>

        {error && (
          <p className="text-xs text-muted-foreground">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={onRetry}
          disabled={checking}
          className={cn(
            'inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium',
            'bg-primary text-primary-foreground hover:bg-primary/90',
            'disabled:pointer-events-none disabled:opacity-50',
          )}
        >
          <RefreshCw className={cn('h-4 w-4', checking && 'animate-spin')} />
          {t('cli.missing.retry')}
        </button>
      </div>
    </div>
  )
}

export default CliMissingBanner
