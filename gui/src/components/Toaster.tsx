import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { FC, ReactNode } from 'react'

import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Toast {
  readonly id: number
  readonly message: string
  readonly kind: 'error' | 'warning' | 'info' | 'success'
}

interface ToastValue {
  toast: (message: string, kind?: Toast['kind']) => void
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ToastCtx = createContext<ToastValue | null>(null)

export function useToast(): ToastValue {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const TOAST_KINDS: Record<Toast['kind'], string> = {
  error: 'bg-destructive text-destructive-foreground',
  warning: 'bg-amber-600 text-white',
  info: 'bg-primary text-primary-foreground',
  success: 'bg-green-600 text-white',
}

const AUTO_DISMISS_MS = 5000

export const ToastProvider: FC<{ readonly children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<readonly Toast[]>([])
  const counterRef = useRef(0)

  const toast = useCallback((message: string, kind: Toast['kind'] = 'error') => {
    const id = ++counterRef.current
    setToasts((prev) => [...prev, { id, message, kind }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, AUTO_DISMISS_MS)
  }, [])

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'rounded-md px-4 py-3 text-sm shadow-lg transition-all',
              TOAST_KINDS[t.kind],
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
