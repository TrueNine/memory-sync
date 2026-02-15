import { useCallback, useEffect, useState } from 'react';

import type { CliStatus } from '@/api/bridge';
import { checkCli } from '@/api/bridge';

export type CliCheckState =
  | { readonly kind: 'checking' }
  | { readonly kind: 'available'; readonly version?: string }
  | { readonly kind: 'missing'; readonly error?: string }

export function useCliStatus() {
  const [state, setState] = useState<CliCheckState>({ kind: 'checking' })

  const recheck = useCallback(async () => {
    setState({ kind: 'checking' })
    try {
      const status: CliStatus = await checkCli()
      if (status.available) {
        setState({ kind: 'available', version: status.version })
      } else {
        setState({ kind: 'missing', error: status.error })
      }
    } catch (err) {
      setState({ kind: 'missing', error: String(err) })
    }
  }, [])

  useEffect(() => { recheck() }, [recheck])

  return { state, recheck } as const
}
