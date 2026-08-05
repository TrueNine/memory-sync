import {describe, expect, it} from 'bun:test'

import {PreviewDiagnosticStore} from './diagnostic-store'

describe('PreviewDiagnosticStore', () => {
  it('aggregates diagnostics without allowing a clean section to erase another section', () => {
    const store = new PreviewDiagnosticStore()
    store.set('prompt.mdx', '1:2', [{severity: 'warning', code: 'first', message: 'First'}])
    store.set('prompt.mdx', '3:4', [])

    expect(store.get('prompt.mdx').map(diagnostic => diagnostic.code)).toEqual(['first'])

    store.set('prompt.mdx', '1:2', [])
    expect(store.get('prompt.mdx')).toEqual([])
  })

  it('clears paths on invalidation, rename, and global reset', () => {
    const store = new PreviewDiagnosticStore()
    const warning = [{severity: 'warning' as const, code: 'warning', message: 'Warning'}]
    store.set('old.mdx', '1:1', warning)
    store.set('new.mdx', '1:1', warning)
    store.rename('old.mdx', 'new.mdx')
    expect(store.get('old.mdx')).toEqual([])
    expect(store.get('new.mdx')).toEqual([])

    store.set('other.mdx', '1:1', warning)
    store.clear()
    expect(store.get('other.mdx')).toEqual([])
  })
})
