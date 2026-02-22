'use client'

import type {ReactNode} from 'react'

type CalloutType = 'info' | 'warning' | 'tip'

const typeStyles: Record<CalloutType, {label: string, className: string}> = {
  info: {
    label: '提示',
    className: 'border-sky-500/60 bg-sky-950/40 text-sky-100'
  },
  warning: {
    label: '注意',
    className: 'border-amber-500/70 bg-amber-950/40 text-amber-100'
  },
  tip: {
    label: '小技巧',
    className: 'border-emerald-500/70 bg-emerald-950/40 text-emerald-100'
  }
}

interface CalloutProps {
  readonly type?: CalloutType
  readonly title?: string
  readonly children: ReactNode
}

export function Callout({type = 'info', title, children}: CalloutProps) {
  const style = typeStyles[type]

  return (
    <div
      className={[
        'my-4 rounded-xl border px-3.5 py-2.5 text-sm shadow-sm',
        'backdrop-blur-sm',
        style.className
      ].join(' ')}
    >
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wide">
        <span className="inline-flex h-1.5 w-1.5 rounded-full bg-current" />
        <span>{title ?? style.label}</span>
      </div>
      <div className="leading-relaxed">{children}</div>
    </div>
  )
}
