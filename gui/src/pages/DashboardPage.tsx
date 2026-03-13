import type { AindexStats } from '@/api/bridge'
import { getAindexStats } from '@/api/bridge'
import AiToolGrid from '@/components/AiToolGrid'
import { usePipeline } from '@/hooks/usePipeline'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { ArrowDownAZ, ArrowUpAZ, BarChart3, Eye, FileText, Languages, Layers, Play, RefreshCw, Trash2 } from 'lucide-react'
import type { FC } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const COLORS = ['#6366f1', '#22d3ee', '#f59e0b', '#10b981', '#f43f5e', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b']

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

interface StatCardProps {
  readonly icon: FC<{ className?: string }>
  readonly label: string
  readonly value: string | number
  readonly sub?: string
}

const StatCard: FC<StatCardProps> = ({ icon: Icon, label, value, sub }) => (
  <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4">
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
      <Icon className="h-5 w-5 text-primary" />
    </div>
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{typeof value === 'number' ? formatNumber(value) : value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  </div>
)

interface TPayload { readonly name?: string; readonly value?: number; readonly color?: string }

const ChartTooltip: FC<{ active?: boolean; payload?: readonly TPayload[]; label?: string; isDark: boolean }> = ({ active, payload, label, isDark }) => {
  if (!active || !payload?.length) return null
  return (
    <div className={cn('rounded-md border px-3 py-2 text-xs shadow-lg', isDark ? 'border-zinc-700 bg-zinc-800 text-zinc-100' : 'border-zinc-200 bg-white text-zinc-800')}>
      {label && <p className="mb-1 font-medium">{label}</p>}
      {payload.map((item, i) => (
        <p key={i} style={{ color: item.color }}>
          {item.name}: {formatNumber(item.value ?? 0)}
        </p>
      ))}
    </div>
  )
}

const DashboardPage: FC = () => {
  const { t } = useI18n()
  const { resolved } = useTheme()
  const isDark = resolved === 'dark'
  const { status, execute, clean, dryRun, reset } = usePipeline()

  const [stats, setStats] = useState<AindexStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [statsError, setStatsError] = useState<string | null>(null)

  type SortKey = 'chars' | 'files' | 'name'
  const [sortBy, setSortBy] = useState<SortKey>('chars')
  const [sortAsc, setSortAsc] = useState(false)

  const cwd = '.'

  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    setStatsError(null)
    try {
      const result = await getAindexStats(cwd)
      setStats(result)
    } catch (e) {
      setStatsError(String(e))
    } finally {
      setStatsLoading(false)
    }
  }, [])

  useEffect(() => { fetchStats() }, [fetchStats])

  const categoryData = useMemo(() =>
    stats?.categories.map((c) => ({
      name: t(`dashboard.stats.${c.name}`),
      files: c.fileCount,
      chars: c.totalChars,
      lines: c.totalLines,
    })) ?? []
  , [stats, t])

  const projectData = useMemo(() => {
    if (!stats) return []
    const sorted = [...stats.projects].sort((a, b) => {
      let cmp = 0
      if (sortBy === 'chars') cmp = a.totalChars - b.totalChars
      else if (sortBy === 'files') cmp = a.fileCount - b.fileCount
      else cmp = a.name.localeCompare(b.name)
      return sortAsc ? cmp : -cmp
    })
    return sorted.slice(0, 15).map((p) => ({
      name: p.name.length > 14 ? `${p.name.slice(0, 12)}…` : p.name,
      fullName: p.name,
      chars: p.totalChars,
      files: p.fileCount,
    }))
  }, [stats, sortBy, sortAsc])

  const extData = useMemo(() =>
    stats?.extensions.slice(0, 8).map((e) => ({
      name: `.${e.ext}`,
      value: e.count,
    })) ?? []
  , [stats])

  const toggleSort = useCallback((key: SortKey) => {
    if (sortBy === key) setSortAsc((v) => !v)
    else { setSortBy(key); setSortAsc(false) }
  }, [sortBy])

  const axisColor = isDark ? '#71717a' : '#a1a1aa'
  const gridColor = isDark ? '#27272a' : '#e4e4e7'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('nav.dashboard')}</h1>
        <button
          type="button"
          onClick={fetchStats}
          disabled={statsLoading}
          className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', statsLoading && 'animate-spin')} />
        </button>
      </div>

      {/* Quick Actions */}
      <section className="flex flex-wrap gap-3">
        <button type="button" onClick={() => execute(cwd)} disabled={status.kind === 'running'}
          className={cn('inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors', 'bg-primary text-primary-foreground hover:bg-primary/90', 'disabled:pointer-events-none disabled:opacity-50')}>
          <Play className="h-4 w-4" />{t('pipeline.execute')}
        </button>
        <button type="button" onClick={() => clean(cwd)} disabled={status.kind === 'running'}
          className={cn('inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors', 'bg-destructive text-destructive-foreground hover:bg-destructive/90', 'disabled:pointer-events-none disabled:opacity-50')}>
          <Trash2 className="h-4 w-4" />{t('pipeline.clean')}
        </button>
        <button type="button" onClick={() => dryRun(cwd)} disabled={status.kind === 'running'}
          className={cn('inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors', 'bg-secondary text-secondary-foreground hover:bg-secondary/80', 'disabled:pointer-events-none disabled:opacity-50')}>
          <Eye className="h-4 w-4" />{t('pipeline.dryRun')}
        </button>
      </section>

      {/* Pipeline Status */}
      {status.kind !== 'idle' && (
        <div className="rounded-lg border border-border bg-card p-3 text-card-foreground">
          {status.kind === 'running' && (
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-sm">{t('pipeline.status.running')}</p>
              {status.currentPlugin && <span className="text-xs text-muted-foreground">— {status.currentPlugin}</span>}
            </div>
          )}
          {status.kind === 'completed' && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">{t('pipeline.status.completed')}</span>
              <span className="text-xs text-muted-foreground">{status.result.totalFiles} files, {status.result.totalDirs} dirs</span>
              <button type="button" onClick={reset} className="ml-auto text-xs text-primary hover:underline">{t('common.confirm')}</button>
            </div>
          )}
          {status.kind === 'error' && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-400">{t('pipeline.status.error')}</span>
              <span className="text-xs text-destructive truncate">{status.message}</span>
              <button type="button" onClick={reset} className="ml-auto text-xs text-primary hover:underline">{t('common.retry')}</button>
            </div>
          )}
        </div>
      )}

      {/* Stats loading / error */}
      {statsLoading && !stats && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          {t('dashboard.stats.loading')}
        </div>
      )}
      {statsError && !stats && (
        <p className="text-sm text-destructive">{t('dashboard.stats.error')}: {statsError}</p>
      )}

      {stats && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={FileText} label={t('dashboard.stats.totalFiles')} value={stats.totalFiles} />
            <StatCard icon={BarChart3} label={t('dashboard.stats.totalChars')} value={stats.totalChars} />
            <StatCard icon={Layers} label={t('dashboard.stats.sourceMdx')} value={stats.totalSourceMdx} />
            <StatCard icon={Languages} label={t('dashboard.stats.translated')} value={stats.totalTranslated} />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Category bar chart */}
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-3 text-sm font-medium">{t('dashboard.stats.categories')}</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={categoryData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: axisColor }} axisLine={{ stroke: gridColor }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} tickFormatter={formatNumber} />
                  <Tooltip content={<ChartTooltip isDark={isDark} />} animationDuration={200} />
                  <Bar dataKey="files" name={t('dashboard.stats.files')} fill="#6366f1" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="lines" name={t('dashboard.stats.lines')} fill="#22d3ee" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Extension pie chart */}
            <div className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-3 text-sm font-medium">{t('dashboard.stats.extensions')}</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={extData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={40} paddingAngle={2} isAnimationActive={false}
                    label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                    {extData.map((_: unknown, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip isDark={isDark} />} animationDuration={200} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Project chars bar chart */}
          {projectData.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium">{t('dashboard.stats.projectChars')}</h3>
                <div className="flex items-center gap-1">
                  {(['chars', 'files', 'name'] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleSort(key)}
                      className={cn(
                        'inline-flex items-center gap-0.5 rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
                        sortBy === key ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {t(`dashboard.sort.${key}`)}
                      {sortBy === key && (sortAsc ? <ArrowUpAZ className="h-3 w-3" /> : <ArrowDownAZ className="h-3 w-3" />)}
                    </button>
                  ))}
                </div>
              </div>
              <ResponsiveContainer width="100%" height={Math.max(200, projectData.length * 32)}>
                <BarChart data={projectData} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} tickFormatter={formatNumber} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} width={110} />
                  <Tooltip content={<ChartTooltip isDark={isDark} />} animationDuration={200} />
                  <Bar dataKey="chars" name={t('dashboard.stats.chars')} radius={[0, 4, 4, 0]} isAnimationActive={false}>
                    {projectData.map((_: unknown, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {/* Supported AI Tools */}
      <AiToolGrid />
    </div>
  )
}

export default DashboardPage
