function resolveEffectiveIncludeSeries(topLevel?: readonly string[], typeSpecific?: readonly string[]): string[] {
  if (topLevel == null && typeSpecific == null) return []
  return [...new Set([...topLevel ?? [], ...typeSpecific ?? []])]
}

function matchesSeries(seriName: string | readonly string[] | null | undefined, effectiveIncludeSeries: readonly string[]): boolean {
  if (seriName == null) return true
  if (effectiveIncludeSeries.length === 0) return true
  if (typeof seriName === 'string') return effectiveIncludeSeries.includes(seriName)
  return seriName.some(name => effectiveIncludeSeries.includes(name))
}

function resolveSubSeries(
  topLevel?: Readonly<Record<string, readonly string[]>>,
  typeSpecific?: Readonly<Record<string, readonly string[]>>
): Record<string, string[]> {
  if (topLevel == null && typeSpecific == null) return {}

  const merged: Record<string, string[]> = {}
  for (const [key, values] of Object.entries(topLevel ?? {})) merged[key] = [...values]

  for (const [key, values] of Object.entries(typeSpecific ?? {})) {
    const existingValues = merged[key] ?? []
    merged[key] = Object.hasOwn(merged, key) ? [...new Set([...existingValues, ...values])] : [...values]
  }

  return merged
}

const testGlobals = globalThis as typeof globalThis & {
  __TNMSC_TEST_NATIVE_BINDING__?: {
    resolveEffectiveIncludeSeries: typeof resolveEffectiveIncludeSeries
    matchesSeries: typeof matchesSeries
    resolveSubSeries: typeof resolveSubSeries
  }
}

testGlobals.__TNMSC_TEST_NATIVE_BINDING__ = {
  resolveEffectiveIncludeSeries,
  matchesSeries,
  resolveSubSeries
}
