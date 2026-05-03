import { describe, expect, it, vi } from 'vitest'

import { clearSavedTimer } from './config-page-timers'

describe('clearSavedTimer', () => {
  it('clears and resets an active timeout ref', () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    const timeoutHandle = setTimeout(() => {}, 10)
    const timerRef = { current: timeoutHandle }

    clearSavedTimer(timerRef)

    expect(clearTimeoutSpy).toHaveBeenCalledWith(timeoutHandle)
    expect(timerRef.current).toBeNull()

    clearTimeoutSpy.mockRestore()
  })

  it('ignores empty timeout refs', () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    const timerRef = { current: null }

    clearSavedTimer(timerRef)

    expect(clearTimeoutSpy).not.toHaveBeenCalled()

    clearTimeoutSpy.mockRestore()
  })
})
