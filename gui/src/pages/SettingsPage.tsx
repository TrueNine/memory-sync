import type { FC } from 'react'
import { useCallback, useState } from 'react'

import { Check, RefreshCw } from 'lucide-react'

import { FONT_OPTIONS, useFont } from '@/hooks/useFont'
import type { ThemePreference } from '@/hooks/useTheme'
import { useTheme } from '@/hooks/useTheme'
import type { Locale } from '@/i18n'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

type UpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'error'

const themeOptions: readonly { readonly value: ThemePreference; readonly labelKey: string }[] = [
  { value: 'light', labelKey: 'settings.theme.light' },
  { value: 'dark', labelKey: 'settings.theme.dark' },
  { value: 'system', labelKey: 'settings.theme.system' },
]

const localeOptions: readonly { readonly value: Locale; readonly label: string }[] = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' },
]

const SettingsPage: FC = () => {
  const { t, locale, setLocale } = useI18n()
  const { preference, setTheme } = useTheme()
  const { font, setFont } = useFont()
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle')

  const checkForUpdates = useCallback(async () => {
    setUpdateStatus('checking')
    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      const update = await check()
      setUpdateStatus(update ? 'available' : 'up-to-date')
    } catch {
      setUpdateStatus('error')
    }
  }, [])

  const updateStatusLabel = (): string => {
    switch (updateStatus) {
      case 'checking':
        return t('settings.update.checking')
      case 'up-to-date':
        return t('settings.update.upToDate')
      case 'available':
        return t('settings.update.available')
      case 'error':
        return t('common.error')
      default:
        return t('settings.update')
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold">{t('settings.title')}</h1>

      {/* Theme */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t('settings.theme')}</h2>
        <div className="flex gap-2">
          {themeOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTheme(opt.value)}
              className={cn(
                'inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors',
                preference === opt.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-card-foreground hover:bg-muted',
              )}
            >
              {preference === opt.value && <Check className="h-3.5 w-3.5" />}
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      </section>

      {/* Language */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t('settings.language')}</h2>
        <div className="flex gap-2">
          {localeOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                if (opt.value !== locale) {
                  setLocale(opt.value)
                  // Monaco NLS is injected at page load — reload to apply editor locale
                  window.location.reload()
                }
              }}
              className={cn(
                'inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors',
                locale === opt.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-card-foreground hover:bg-muted',
              )}
            >
              {locale === opt.value && <Check className="h-3.5 w-3.5" />}
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* Font */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t('settings.font')}</h2>
        <div className="flex flex-wrap gap-2">
          {FONT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFont(opt.value)}
              className={cn(
                'inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm transition-colors',
                font === opt.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-card-foreground hover:bg-muted',
              )}
              style={{ fontFamily: opt.value === 'monospace' ? 'monospace' : `'${opt.value}', monospace` }}
            >
              {font === opt.value && <Check className="h-3.5 w-3.5" />}
              {opt.value === 'monospace' ? t('settings.font.system') : opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* Update */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t('settings.update')}</h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={checkForUpdates}
            disabled={updateStatus === 'checking'}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              'bg-secondary text-secondary-foreground hover:bg-secondary/80',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', updateStatus === 'checking' && 'animate-spin')} />
            {t('settings.update')}
          </button>
          <span
            className={cn(
              'text-sm',
              updateStatus === 'up-to-date' && 'text-green-600 dark:text-green-400',
              updateStatus === 'available' && 'text-blue-600 dark:text-blue-400',
              updateStatus === 'error' && 'text-destructive',
              (updateStatus === 'idle' || updateStatus === 'checking') && 'text-muted-foreground',
            )}
          >
            {updateStatusLabel()}
          </span>
        </div>
      </section>
    </div>
  )
}

export default SettingsPage
