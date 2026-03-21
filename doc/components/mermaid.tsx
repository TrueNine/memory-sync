'use client'

import type {ReactNode} from 'react'
import {useEffect, useId, useRef, useState} from 'react'

type MermaidModule = typeof import('mermaid')

interface MermaidProps {
  readonly chart: string
  readonly title?: string
}

let mermaidPromise: Promise<MermaidModule['default']> | undefined
let mermaidInitialized = false

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
  const [svg, setSvg] = useState<string>()
  const [error, setError] = useState<string>()
  const id = useId().replaceAll(':', '')

  useEffect(() => {
    let cancelled = false

    setSvg(void 0)
    setError(void 0)

    void loadMermaid()
      .then(async mermaid => {
        const {svg: renderedSvg, bindFunctions} = await mermaid.render(
          `mermaid-${id}-${Date.now()}`,
          chart.trim()
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
  }, [chart, id])

  const hasTitle = title !== void 0 && title !== ''
  const hasSvg = svg !== void 0 && svg !== ''
  const hasError = error !== void 0 && error !== ''
  let diagramBody: ReactNode = <div className="mermaid-diagram__loading">Rendering diagram...</div>

  if (hasSvg) {
    diagramBody = <div dangerouslySetInnerHTML={{__html: svg}} />
  } else if (hasError) {
    diagramBody = (
      <pre className="mermaid-diagram__fallback">
        <code>{chart}</code>
      </pre>
    )
  }

  return (
    <figure className="mermaid-diagram" data-mermaid-theme="dark">
      {hasTitle && <figcaption className="mermaid-diagram__title">{title}</figcaption>}
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
