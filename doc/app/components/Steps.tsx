'use client'

import type {ReactNode} from 'react'

interface StepsProps {
  readonly children: ReactNode
}

export function Steps({children}: StepsProps) {
  return (
    <ol className="my-4 space-y-2.5 border-l border-slate-700/60 pl-4 text-sm text-slate-100">
      {children}
    </ol>
  )
}

interface StepProps {
  readonly title: string
  readonly children?: ReactNode
}

export function Step({title, children}: StepProps) {
  return (
    <li className="relative pl-4">
      <span className="absolute -left-[0.6rem] top-1 inline-flex h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.8)]" />
      <div className="font-medium text-slate-50">{title}</div>
      {children != null ? <div className="mt-0.5 text-xs text-slate-300">{children}</div> : null}
    </li>
  )
}
