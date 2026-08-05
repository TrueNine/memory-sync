import {describe, expect, it} from 'bun:test'

import {PromptMetadataCache} from './prompt-metadata-cache'

describe('PromptMetadataCache', () => {
  it('caches static file metadata until invalidated', async () => {
    let loads = 0
    const cache = new PromptMetadataCache(async () => {
      loads += 1
      return 'export const profile = { name: "TNMSO" }\n'
    })

    const first = await cache.get('prompt.mdx')
    const second = await cache.get('prompt.mdx')
    cache.invalidate('prompt.mdx')
    const third = await cache.get('prompt.mdx')

    expect(first.metadata).toEqual({profile: {name: 'TNMSO'}})
    expect(second).toEqual(first)
    expect(third.metadata).toEqual(first.metadata)
    expect(loads).toBe(2)
  })

  it('invalidates both paths on rename and all entries on clear', async () => {
    let loads = 0
    const cache = new PromptMetadataCache(async path => {
      loads += 1
      return `export const path = "${path}"\n`
    })

    await cache.get('old.mdx')
    await cache.get('new.mdx')
    cache.rename('old.mdx', 'new.mdx')
    await cache.get('old.mdx')
    await cache.get('new.mdx')
    cache.clear()
    await cache.get('new.mdx')

    expect(loads).toBe(5)
  })

  it('does not cache body expression diagnostics as metadata diagnostics', async () => {
    const cache = new PromptMetadataCache(async () => [
      'export const profile = { name: "TNMSO" }',
      '',
      'Hello {tool.name}',
      '',
    ].join('\n'))

    const result = await cache.get('prompt.mdx')

    expect(result.metadata).toEqual({profile: {name: 'TNMSO'}})
    expect(result.diagnostics).toEqual([])
  })
})
