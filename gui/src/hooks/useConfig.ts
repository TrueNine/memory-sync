import { useCallback, useState } from 'react';

import { loadConfig } from '@/api/bridge';

export type ConfigStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'loaded'; readonly config: unknown }
  | { readonly kind: 'error'; readonly message: string }

export interface UseConfigReturn {
  readonly status: ConfigStatus
  readonly load: (cwd: string) => Promise<void>
  readonly reset: () => void
}

export function useConfig(): UseConfigReturn {
  const [status, setStatus] = useState<ConfigStatus>({ kind: 'idle' })

  const load = useCallback(async (cwd: string) => {
    setStatus({ kind: 'loading' })
    try {
      const config = await loadConfig(cwd)
      setStatus({ kind: 'loaded', config })
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }, [])

  const reset = useCallback(() => {
    setStatus({ kind: 'idle' })
  }, [])

  return { status, load, reset }
}
