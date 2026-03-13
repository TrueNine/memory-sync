import {describe, expect, it} from 'vitest'
import {resolveTopicScopes} from './scopePolicy'

describe('resolveTopicScopes', () => {
  it('selects highest available scope for single-scope topics', () => {
    const result = resolveTopicScopes({
      defaultScopes: ['project', 'workspace', 'global'],
      supportedScopes: ['project', 'workspace', 'global'],
      singleScope: true,
      availableScopes: ['workspace', 'global']
    })

    expect(result).toEqual(['workspace'])
  })

  it('respects requested scope when provided', () => {
    const result = resolveTopicScopes({
      requestedScopes: ['global'],
      defaultScopes: ['project', 'workspace', 'global'],
      supportedScopes: ['project', 'workspace', 'global'],
      singleScope: true,
      availableScopes: ['project', 'global']
    })

    expect(result).toEqual(['global'])
  })

  it('returns prioritized multi-scope list for multi-scope topics', () => {
    const result = resolveTopicScopes({
      requestedScopes: ['global', 'project', 'workspace'],
      defaultScopes: ['project', 'workspace', 'global'],
      supportedScopes: ['project', 'workspace', 'global'],
      singleScope: false
    })

    expect(result).toEqual(['project', 'workspace', 'global'])
  })

  it('returns empty when requested scope is unsupported', () => {
    const result = resolveTopicScopes({
      requestedScopes: ['workspace'],
      defaultScopes: ['project'],
      supportedScopes: ['global'],
      singleScope: true,
      availableScopes: ['workspace', 'global']
    })

    expect(result).toEqual([])
  })
})
