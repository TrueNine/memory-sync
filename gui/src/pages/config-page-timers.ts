export interface TimeoutRef {
  current: ReturnType<typeof setTimeout> | null
}

export function clearSavedTimer(timerRef: TimeoutRef): void {
  // Fixes #372: clear the pending save-status timeout during teardown so
  // ConfigPage cannot update state after the component has unmounted.
  if (timerRef.current) {
    clearTimeout(timerRef.current)
    timerRef.current = null
  }
}
