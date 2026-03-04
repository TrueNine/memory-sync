import type {OutputDeclarationScope} from './plugin'

export const DEFAULT_SCOPE_PRIORITY: readonly OutputDeclarationScope[] = ['project', 'workspace', 'global'] as const

export type ScopeSelectionInput = OutputDeclarationScope | readonly OutputDeclarationScope[] | undefined

function normalizeSelection(selection: ScopeSelectionInput): OutputDeclarationScope[] {
  if (selection == null) return []
  if (typeof selection === 'string') return [selection]
  const unique: OutputDeclarationScope[] = []
  for (const scope of selection) {
    if (!unique.includes(scope)) unique.push(scope)
  }
  return unique
}

function sortByPriority(
  scopes: readonly OutputDeclarationScope[],
  priority: readonly OutputDeclarationScope[]
): OutputDeclarationScope[] {
  const priorityIndex = new Map<OutputDeclarationScope, number>()
  for (const [index, scope] of priority.entries()) priorityIndex.set(scope, index)

  return [...scopes].sort((a, b) => {
    const ia = priorityIndex.get(a) ?? Number.MAX_SAFE_INTEGER
    const ib = priorityIndex.get(b) ?? Number.MAX_SAFE_INTEGER
    return ia - ib
  })
}

export interface ResolveTopicScopesOptions {
  readonly requestedScopes?: ScopeSelectionInput
  readonly defaultScopes: readonly OutputDeclarationScope[]
  readonly supportedScopes: readonly OutputDeclarationScope[]
  readonly singleScope: boolean
  readonly availableScopes?: readonly OutputDeclarationScope[]
  readonly priority?: readonly OutputDeclarationScope[]
}

export function resolveTopicScopes(
  options: ResolveTopicScopesOptions
): readonly OutputDeclarationScope[] {
  const {
    requestedScopes,
    defaultScopes,
    supportedScopes,
    singleScope,
    availableScopes,
    priority = DEFAULT_SCOPE_PRIORITY
  } = options

  const requested = normalizeSelection(requestedScopes)
  const defaults = normalizeSelection(defaultScopes)
  const supported = new Set(normalizeSelection(supportedScopes))

  const base = requested.length > 0 ? requested : defaults
  const candidates = base.filter(scope => supported.has(scope))
  if (candidates.length === 0) return []

  const prioritized = sortByPriority(candidates, priority)

  if (singleScope) {
    if (availableScopes != null && availableScopes.length > 0) {
      const available = new Set(availableScopes)
      const matched = prioritized.find(scope => available.has(scope))
      if (matched == null) return []
      return [matched]
    }

    const [first] = prioritized
    if (first == null) return []
    return [first]
  }

  return prioritized
}

