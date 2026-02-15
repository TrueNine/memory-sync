import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import type { FC } from 'react'

interface AiTool {
  readonly name: string
  readonly icon: FC<{ className?: string }>
  readonly color: string
}

// ---------------------------------------------------------------------------
// Inline SVG icons for each supported AI tool
// ---------------------------------------------------------------------------

const ClaudeIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M4.709 15.955l4.397-2.006a.273.273 0 01.37.129l.098.222a.283.283 0 01-.126.375l-4.389 2.006a.273.273 0 01-.37-.129l-.106-.222a.283.283 0 01.126-.375zm8.17-7.612a.46.46 0 01.264-.158.44.44 0 01.304.047l.193.11a.46.46 0 01.158.264.44.44 0 01-.047.304L9.32 16.68a.46.46 0 01-.264.158.44.44 0 01-.304-.047l-.193-.11a.46.46 0 01-.158-.264.44.44 0 01.047-.304l4.43-7.77zM15.07 8.07l.193.11a.46.46 0 01.158.264.44.44 0 01-.047.304l-4.43 7.77a.46.46 0 01-.264.158.44.44 0 01-.304-.047l-.193-.11a.46.46 0 01-.158-.264.44.44 0 01.047-.304l4.43-7.77a.46.46 0 01.264-.158.44.44 0 01.304.047zm4.221 7.879l-4.389 2.006a.273.273 0 01-.37-.129l-.106-.222a.283.283 0 01.126-.375l4.397-2.006a.273.273 0 01.37.129l.098.222a.283.283 0 01-.126.375z" />
  </svg>
)

const GeminiIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.74 0 3.34.56 4.65 1.5L12 12V5zm-5.65 2.5L12 12H5c0-1.74.56-3.34 1.35-4.5zM5 12h7l-5.65 5.5C5.56 16.34 5 14.74 5 13v-1zm2.35 5.5L12 12v7c-1.74 0-3.34-.56-4.65-1.5zM12 19v-7l5.65 5.5c-1.31.94-2.91 1.5-4.65 1.5zm5.65-2.5L12 12h7c0 1.74-.56 3.34-1.35 4.5zM19 12h-7l5.65-5.5c.79 1.16 1.35 2.76 1.35 4.5v1zm-2.35-5.5L12 12V5c1.74 0 3.34.56 4.65 1.5z" />
  </svg>
)

const CursorIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M5.5 3.21a1 1 0 011.32-.47l12 5.5a1 1 0 01.05 1.8l-4.84 2.42-2.42 4.84a1 1 0 01-1.8-.05l-5.5-12a1 1 0 01.19-1.04z" />
  </svg>
)

const KiroIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <rect x="3" y="3" width="18" height="18" rx="4" opacity="0.15" />
    <path d="M8 7v10M12 7v4l4-4M12 13l4 4" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const WarpIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M4 4l8 4-8 4V4zm8 8l8 4-8 4V12z" />
  </svg>
)

const CodexIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="12" r="10" opacity="0.12" />
    <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zm-1 4v3H8v2h3v3h2v-3h3v-2h-3V8h-2z" />
  </svg>
)

const JetBrainsIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <rect x="2" y="2" width="20" height="20" rx="2" />
    <text x="5" y="17" fontSize="10" fontWeight="bold" fill="black" fontFamily="sans-serif">JB</text>
  </svg>
)

const QoderIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="12" r="9" opacity="0.15" />
    <path d="M9 8a5 5 0 104.5 7.2L15 17" strokeWidth="2" stroke="currentColor" fill="none" strokeLinecap="round" />
  </svg>
)

const AntigravityIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 3l-1.5 6H6l4.5 3.5L9 19l3-2.5 3 2.5-1.5-6.5L18 9h-4.5z" />
  </svg>
)

const DroidIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <rect x="5" y="10" width="14" height="9" rx="2" opacity="0.15" />
    <path d="M8 7a4 4 0 018 0M9 13h.01M15 13h.01M7 10h10a2 2 0 012 2v5a2 2 0 01-2 2H7a2 2 0 01-2-2v-5a2 2 0 012-2z" strokeWidth="1.5" stroke="currentColor" fill="none" strokeLinecap="round" />
  </svg>
)

const OpencodeIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z" />
  </svg>
)

const VSCodeIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.5 2L9 10.5 4.5 7 2 8.5v7L4.5 17 9 13.5 17.5 22l4.5-2V4l-4.5-2zM4.5 14.5v-5L7 12l-2.5 2.5zM17.5 19l-7-7 7-7v14z" />
  </svg>
)

const AgentsIcon: FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
  </svg>
)

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const AI_TOOLS: readonly AiTool[] = [
  { name: 'Claude Code', icon: ClaudeIcon, color: '#d97757' },
  { name: 'Gemini CLI', icon: GeminiIcon, color: '#4285f4' },
  { name: 'Cursor', icon: CursorIcon, color: '#00b4d8' },
  { name: 'Kiro IDE', icon: KiroIcon, color: '#f59e0b' },
  { name: 'Warp', icon: WarpIcon, color: '#01c38d' },
  { name: 'OpenAI Codex', icon: CodexIcon, color: '#10a37f' },
  { name: 'JetBrains AI', icon: JetBrainsIcon, color: '#fe315d' },
  { name: 'Qoder', icon: QoderIcon, color: '#a78bfa' },
  { name: 'Antigravity', icon: AntigravityIcon, color: '#f97316' },
  { name: 'Droid', icon: DroidIcon, color: '#6366f1' },
  { name: 'Opencode', icon: OpencodeIcon, color: '#22d3ee' },
  { name: 'VS Code', icon: VSCodeIcon, color: '#007acc' },
  { name: 'AGENTS.md', icon: AgentsIcon, color: '#10b981' },
]

// ---------------------------------------------------------------------------
// Grid component
// ---------------------------------------------------------------------------

const AiToolGrid: FC = () => {
  const { t } = useI18n()
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium">{t('dashboard.tools.title')}</h3>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7">
        {AI_TOOLS.map((tool) => (
          <div
            key={tool.name}
            className={cn(
              'flex flex-col items-center gap-1.5 rounded-lg border border-transparent p-2.5',
              'transition-colors hover:border-border hover:bg-accent/50',
            )}
          >
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${tool.color}18`, color: tool.color }}
            >
              <tool.icon className="h-5 w-5" />
            </div>
            <span className="text-center text-[10px] leading-tight text-muted-foreground">{tool.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default AiToolGrid
