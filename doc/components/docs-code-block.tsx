'use client'

import type {HTMLAttributes, ReactNode} from 'react'
import {useEffect, useRef, useState} from 'react'

interface DocsCodeBlockProps {
  readonly children: ReactNode
  readonly className?: string
  readonly code: string
  readonly filename?: string
  readonly language: string
  readonly pagefindIgnore?: string
  readonly preProps: HTMLAttributes<HTMLPreElement>
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

export function DocsCodeBlock({
  children,
  className,
  code,
  filename,
  language,
  pagefindIgnore,
  preProps
}: DocsCodeBlockProps) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle')
  const hasFilename = typeof filename === 'string' && filename !== ''
  const hasLanguage = language !== ''
  const title = hasFilename ? filename : language
  const showLanguage = hasFilename && hasLanguage && language !== 'TEXT'

  useEffect(() =>
    () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }, [])

  async function handleCopy() {
    if (!code) {
      return
    }

    try {
      await navigator.clipboard.writeText(code)
      setStatus('copied')
    } catch {
      setStatus('failed')
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    timeoutRef.current = setTimeout(() => {
      setStatus('idle')
    }, 1800)
  }

  return (
    <div className="docs-code-block group">
      <div className="docs-code-block-header">
        <div className="docs-code-block-meta">
          <span className="docs-code-block-title" title={title}>
            {title}
          </span>
          {showLanguage ? <span className="docs-code-block-language">{language}</span> : null}
        </div>
        <button
          type="button"
          className="docs-code-block-copy"
          onClick={() => {
            void handleCopy()
          }}
          aria-label={status === 'copied' ? 'Copied code block' : 'Copy code block'}
          title={status === 'copied' ? 'Copied' : 'Copy'}
        >
          {status === 'copied' ? <CheckIcon /> : <CopyIcon />}
          <span className="docs-code-block-copy-label">{status === 'copied' ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div data-pagefind-ignore={pagefindIgnore} className="docs-code-block-content">
        <pre
          className={[
            'docs-code-block-pre',
            className ?? ''
          ].join(' ').trim()}
          {...preProps}
        >
          {children}
        </pre>
      </div>
    </div>
  )
}
