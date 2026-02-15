import { useCallback, useState } from 'react';

import type { PipelineResult } from '@/api/bridge';
import { cleanOutputs, executePipeline } from '@/api/bridge';

export type PipelineStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'running'; readonly currentPlugin?: string }
  | { readonly kind: 'completed'; readonly result: PipelineResult }
  | { readonly kind: 'error'; readonly message: string }

export interface UsePipelineReturn {
  readonly status: PipelineStatus
  readonly execute: (cwd: string) => Promise<void>
  readonly clean: (cwd: string) => Promise<void>
  readonly dryRun: (cwd: string) => Promise<void>
  readonly reset: () => void
}

export function usePipeline(): UsePipelineReturn {
  const [status, setStatus] = useState<PipelineStatus>({ kind: 'idle' })

  const execute = useCallback(async (cwd: string) => {
    setStatus({ kind: 'running' })
    try {
      const result = await executePipeline(cwd, false)
      setStatus({ kind: 'completed', result })
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }, [])

  const clean = useCallback(async (cwd: string) => {
    setStatus({ kind: 'running' })
    try {
      const result = await cleanOutputs(cwd, false)
      setStatus({ kind: 'completed', result })
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }, [])

  const dryRun = useCallback(async (cwd: string) => {
    setStatus({ kind: 'running' })
    try {
      const result = await executePipeline(cwd, true)
      setStatus({ kind: 'completed', result })
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }, [])

  const reset = useCallback(() => {
    setStatus({ kind: 'idle' })
  }, [])

  return { status, execute, clean, dryRun, reset }
}
