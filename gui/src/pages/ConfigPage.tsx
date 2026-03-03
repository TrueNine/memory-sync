
import type { FC } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { FolderOpen, RefreshCw, Save } from 'lucide-react'

import { openConfigDir, readConfigFile, writeConfigFile } from '@/api/bridge'
import JsonEditor from '@/components/JsonEditor'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { validateConfig } from '@/utils/configValidation'

type EditorTab = 'form' | 'json'

type SaveStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved' }
  | { readonly kind: 'error'; readonly message: string }

const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error'] as const

const TOP_LEVEL_STRING_FIELDS = [
  'workspaceDir',
] as const

interface ConfigData {
  readonly [key: string]: unknown
}

function parseConfig(raw: string): ConfigData {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as ConfigData
    }
  } catch { /* empty */ }
  return {}
}

function serializeConfig(data: ConfigData): string {
  return JSON.stringify(data, null, 2) + '\n'
}

interface FormFieldProps {
  readonly label: string
  readonly description: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly placeholder?: string
}

const FormField: FC<FormFieldProps> = ({ label, description, value, onChange, placeholder }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-sm font-medium text-foreground">{label}</label>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        'rounded-md border border-input bg-background px-3 py-2 text-sm',
        'placeholder:text-muted-foreground',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
      )}
    />
    <p className="text-xs text-muted-foreground">{description}</p>
  </div>
)

interface ConfigFormProps {
  readonly data: ConfigData
  readonly onChange: (data: ConfigData) => void
  readonly t: (key: string) => string
}

const ConfigForm: FC<ConfigFormProps> = ({ data, onChange, t }) => {
  const updateField = useCallback((field: string, value: unknown) => {
    const next = { ...data }
    if (value === '' || value === undefined) {
      const { [field]: _, ...rest } = next
      onChange(rest)
    } else {
      onChange({ ...next, [field]: value })
    }
  }, [data, onChange])

  const updateNestedField = useCallback((parent: string, field: string, value: unknown) => {
    const parentObj = (typeof data[parent] === 'object' && data[parent] !== null ? data[parent] : {}) as Record<string, unknown>
    const next = { ...data, [parent]: { ...parentObj, [field]: value === '' ? undefined : value } }
    onChange(next)
  }, [data, onChange])

  const aindex = (typeof data['aindex'] === 'object' && data['aindex'] !== null
    ? data['aindex']
    : {}) as Record<string, unknown>

  return (
    <div className="flex flex-col gap-5 overflow-y-auto p-1">
      {TOP_LEVEL_STRING_FIELDS.map((field) => (
        <FormField
          key={field}
          label={t(`config.field.${field}`)}
          description={t(`config.field.${field}.desc`)}
          value={(data[field] as string) ?? ''}
          onChange={(v) => updateField(field, v)}
          placeholder="~/project"
        />
      ))}

      <FormField
        label={t('config.field.aindex.name')}
        description={t('config.field.aindex.name.desc')}
        value={(aindex['name'] as string) ?? ''}
        onChange={(v) => updateNestedField('aindex', 'name', v)}
        placeholder="aindex"
      />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-foreground">{t('config.field.logLevel')}</label>
        <select
          value={(data['logLevel'] as string) ?? ''}
          onChange={(e) => updateField('logLevel', e.target.value || undefined)}
          className={cn(
            'rounded-md border border-input bg-background px-3 py-2 text-sm',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1',
          )}
        >
          <option value="">—</option>
          {LOG_LEVELS.map((level) => (
            <option key={level} value={level}>{level}</option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">{t('config.field.logLevel.desc')}</p>
      </div>
    </div>
  )
}

const ConfigPage: FC = () => {
  const { t } = useI18n()

  const [tab, setTab] = useState<EditorTab>('form')
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: 'idle' })
  const [validationErrors, setValidationErrors] = useState<readonly { field: string; message: string; severity: string }[]>([])
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isDirty = content !== originalContent

  const loadFile = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    setSaveStatus({ kind: 'idle' })
    try {
      const raw = await readConfigFile('global', '.')
      const text = raw || '{\n  \n}\n'
      setContent(text)
      setOriginalContent(text)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadFile() }, [loadFile])

  useEffect(() => {
    try {
      const parsed: unknown = JSON.parse(content)
      setValidationErrors(validateConfig(parsed))
    } catch {
      setValidationErrors([])
    }
  }, [content])

  const handleSave = useCallback(async () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    setSaveStatus({ kind: 'saving' })
    try {
      JSON.parse(content)
      await writeConfigFile('global', '.', content)
      setOriginalContent(content)
      setSaveStatus({ kind: 'saved' })
      savedTimerRef.current = setTimeout(() => setSaveStatus({ kind: 'idle' }), 2000)
    } catch (err) {
      setSaveStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }, [content])

  const handleFormChange = useCallback((data: ConfigData) => {
    setContent(serializeConfig(data))
  }, [])

  const handleOpenDir = useCallback(async () => {
    try { await openConfigDir() } catch { /* best-effort */ }
  }, [])

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
            onClick={handleOpenDir}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              'bg-secondary text-secondary-foreground hover:bg-secondary/80',
            )}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            {t('config.openDir')}
          </button>
          <button
            type="button"
            onClick={loadFile}
            disabled={loading}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              'bg-secondary text-secondary-foreground hover:bg-secondary/80',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
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

      {/* Editor tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {(['form', 'json'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setTab(s)}
            className={cn(
              'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              tab === s
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(`config.tab.${s}`)}
          </button>
        ))}
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-3 text-xs">
        {isDirty && <span className="text-amber-500">{t('config.unsaved')}</span>}
        {saveStatus.kind === 'saved' && <span className="text-green-500">{t('common.success')}</span>}
        {saveStatus.kind === 'error' && <span className="text-destructive">{saveStatus.message}</span>}
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

      {/* Content area */}
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : tab === 'form' ? (
          <div className="h-full overflow-y-auto p-4">
            <ConfigForm data={parseConfig(content)} onChange={handleFormChange} t={t} />
          </div>
        ) : (
          <JsonEditor value={content} onChange={setContent} />
        )}
      </div>
    </div>
  )
}

export default ConfigPage
