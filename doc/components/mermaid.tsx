'use client'

import type {ReactNode} from 'react'
import {useEffect, useId, useRef, useState} from 'react'

type MermaidModule = typeof import('mermaid')

interface MermaidProps {
  readonly chart: string
  readonly title?: string
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

let mermaidPromise: Promise<MermaidModule['default']> | undefined
let mermaidInitialized = false

function normalizeChart(chart: string): string {
  return chart
    .replaceAll('\\r\\n', '\n')
    .replaceAll('\\n', '\n')
    .replaceAll('\\t', '  ')
    .trim()
}

async function loadMermaid() {
  mermaidPromise ??= import('mermaid').then(({default: mermaid}) => {
    if (mermaidInitialized) {
      return mermaid
    }

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'dark',
      themeVariables: {
        background: '#0f1117',
        darkMode: 'true',
        edgeLabelBackground: '#0f1117',
        fontFamily:
          'var(--font-mono), "JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
        lineColor: '#93a4bf',
        mainBkg: '#151b28',
        nodeBorder: '#5d7398',
        primaryBorderColor: '#6f8ecf',
        primaryColor: '#151b28',
        primaryTextColor: '#f8fafc',
        secondaryBorderColor: '#5d7398',
        secondaryColor: '#1a2334',
        secondaryTextColor: '#f8fafc',
        tertiaryBorderColor: '#93a4bf',
        tertiaryColor: '#0f1117',
        tertiaryTextColor: '#e5edf8',
        textColor: '#f8fafc'
      }
    })
    mermaidInitialized = true

    return mermaid
  })

  return mermaidPromise
}

export function Mermaid({chart, title}: MermaidProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [svg, setSvg] = useState<string>()
  const [error, setError] = useState<string>()
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const id = useId().replaceAll(':', '')
  const normalizedChart = normalizeChart(chart)
  const diagramTitle = title ?? 'Mermaid'

  useEffect(() => {
    let cancelled = false

    setSvg(void 0)
    setError(void 0)

    void loadMermaid()
      .then(async mermaid => {
        const {svg: renderedSvg, bindFunctions} = await mermaid.render(
          `mermaid-${id}-${Date.now()}`,
          normalizedChart
        )

        if (cancelled) {
          return
        }

        setSvg(renderedSvg)

        requestAnimationFrame(() => {
          if (containerRef.current) {
            bindFunctions?.(containerRef.current)
          }
        })
      })
      .catch(renderError => {
        if (cancelled) {
          return
        }

        setError(renderError instanceof Error ? renderError.message : 'Unknown Mermaid render error')
      })

    return () => {
      cancelled = true
    }
  }, [id, normalizedChart])

  useEffect(() =>
    () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }, [])

  async function handleCopy() {
    if (!normalizedChart) {
      return
    }

    try {
      await navigator.clipboard.writeText(normalizedChart)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('failed')
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = setTimeout(() => {
      setCopyStatus('idle')
    }, 1800)
  }

  const hasTitle = title !== void 0 && title !== ''
  const hasSvg = svg !== void 0 && svg !== ''
  const hasError = error !== void 0 && error !== ''
  let diagramBody: ReactNode = <div className="mermaid-diagram__loading">Rendering diagram...</div>

  if (hasSvg) {
    diagramBody = <div dangerouslySetInnerHTML={{__html: svg}} />
  } else if (hasError) {
    diagramBody = (
      <pre className="mermaid-diagram__fallback">
        <code>{normalizedChart}</code>
      </pre>
    )
  }

  return (
    <figure className="mermaid-diagram" data-mermaid-theme="dark">
      <div className="docs-code-block-header mermaid-diagram__header">
        <div className="docs-code-block-meta">
          <span className="docs-code-block-title" title={diagramTitle}>
            {diagramTitle}
          </span>
          <span className="docs-code-block-language">MERMAID</span>
        </div>
        <button
          type="button"
          className="docs-code-block-copy"
          onClick={() => {
            void handleCopy()
          }}
          aria-label={copyStatus === 'copied' ? 'Copied Mermaid source' : 'Copy Mermaid source'}
          title={copyStatus === 'copied' ? 'Copied' : 'Copy Mermaid'}
        >
          {copyStatus === 'copied' ? <CheckIcon /> : <CopyIcon />}
          <span className="docs-code-block-copy-label">{copyStatus === 'copied' ? 'Copied' : 'Copy Mermaid'}</span>
        </button>
      </div>
      <div ref={containerRef} className="mermaid-diagram__canvas">{diagramBody}</div>
      {hasError && (
        <p className="mermaid-diagram__error">
          Mermaid render failed:
          {' '}
          {error}
        </p>
      )}
    </figure>
  )
}
