
import type { FC } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { RefreshCw, Save } from 'lucide-react'

import { readConfigFile, writeConfigFile } from '@/api/bridge'
import JsonEditor from '@/components/JsonEditor'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { validateConfig } from '@/utils/configValidation'

type ConfigScope = 'cwd' | 'global'

type SaveStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved' }
  | { readonly kind: 'error'; readonly message: string }

const ConfigPage: FC = () => {
  const { t } = useI18n()
  const cwd = '.'

  const [scope, setScope] = useState<ConfigScope>('cwd')
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: 'idle' })
  const [validationErrors, setValidationErrors] = useState<readonly { field: string; message: string; severity: string }[]>([])
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isDirty = content !== originalContent

  const loadFile = useCallback(async (s: ConfigScope) => {
    setLoading(true)
    setLoadError(null)
    setSaveStatus({ kind: 'idle' })
    try {
      const raw = await readConfigFile(s, cwd)
      const text = raw || '{\n  \n}\n'
      setContent(text)
      setOriginalContent(text)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [cwd])

  useEffect(() => {
    loadFile(scope)
  }, [scope, loadFile])

  // Validate on content change
  useEffect(() => {
    try {
      const parsed = JSON.parse(content)
      setValidationErrors(validateConfig(parsed))
    } catch {
      setValidationErrors([])
    }
  }, [content])

  const handleSave = useCallback(async () => {
    if (savedTimerRef.current) {
      clearTimeout(savedTimerRef.current)
    }
    setSaveStatus({ kind: 'saving' })
    try {
      JSON.parse(content)
      await writeConfigFile(scope, cwd, content)
      setOriginalContent(content)
      setSaveStatus({ kind: 'saved' })
      savedTimerRef.current = setTimeout(() => setSaveStatus({ kind: 'idle' }), 2000)
    } catch (err) {
      setSaveStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }, [content, scope, cwd])

  const hasErrors = validationErrors.some((e) => e.severity === 'error')
  const hasWarnings = validationErrors.some((e) => e.severity === 'warning')

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('config.title')}</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadFile(scope)}
            disabled={loading}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              'bg-secondary text-secondary-foreground hover:bg-secondary/80',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            {t('common.retry')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || saveStatus.kind === 'saving' || hasErrors}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              'bg-primary text-primary-foreground hover:bg-primary/90',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            <Save className="h-3.5 w-3.5" />
            {saveStatus.kind === 'saving' ? t('config.saving') : t('config.save')}
          </button>
        </div>
      </div>

      {/* Scope tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {(['cwd', 'global'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setScope(s)}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              scope === s
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(`config.scope.${s}`)}
          </button>
        ))}
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-3 text-xs">
        {isDirty && (
          <span className="text-amber-500">{t('config.unsaved')}</span>
        )}
        {saveStatus.kind === 'saved' && (
          <span className="text-green-500">{t('common.success')}</span>
        )}
        {saveStatus.kind === 'error' && (
          <span className="text-destructive">{saveStatus.message}</span>
        )}
        {hasErrors && (
          <span className="text-destructive">
            {validationErrors.filter((e) => e.severity === 'error').length} {t('config.errors')}
          </span>
        )}
        {hasWarnings && (
          <span className="text-amber-500">
            {validationErrors.filter((e) => e.severity === 'warning').length} {t('config.warnings')}
          </span>
        )}
      </div>

      {/* Load error */}
      {loadError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{loadError}</p>
        </div>
      )}

      {/* Editor */}
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <JsonEditor value={content} onChange={setContent} />
        )}
      </div>
    </div>
  )
}

export default ConfigPage
