import {describe, expect, it} from 'vitest'
import {resolveTopicScopes} from './scopePolicy'

describe('resolveTopicScopes', () => {
  it('selects highest available scope for single-scope topics', () => {
    const result = resolveTopicScopes({
      defaultScopes: ['project', 'global'],
      supportedScopes: ['project', 'global'],
      singleScope: true,
      availableScopes: ['project', 'global']
    })

    expect(result).toEqual(['project'])
  })

  it('respects requested scope when provided', () => {
    const result = resolveTopicScopes({
      requestedScopes: ['global'],
      defaultScopes: ['project', 'global'],
      supportedScopes: ['project', 'global'],
      singleScope: true,
      availableScopes: ['project', 'global']
    })

    expect(result).toEqual(['global'])
  })

  it('returns prioritized multi-scope list for multi-scope topics', () => {
    const result = resolveTopicScopes({
      requestedScopes: ['global', 'project'],
      defaultScopes: ['project', 'global'],
      supportedScopes: ['project', 'global'],
      singleScope: false
    })

    expect(result).toEqual(['project', 'global'])
  })

  it('returns empty when requested scope is unsupported', () => {
    const result = resolveTopicScopes({
      requestedScopes: ['project'],
      defaultScopes: ['project'],
      supportedScopes: ['global'],
      singleScope: true,
      availableScopes: ['project', 'global']
    })

    expect(result).toEqual([])
  })
})
