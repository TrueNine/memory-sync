import {describe, expect, it} from 'bun:test'

import {processPreviewSection} from './processor'

describe('processPreviewSection', () => {
  it('only renders enabled, non-recursive MDX sections', async () => {
    const rendered: string[] = []
    const render = (markdown: string): void => {
      rendered.push(markdown)
    }

    const md = await processPreviewSection({
      sourcePath: 'prompt.md',
      source: 'Hello',
      enabled: true,
      nested: false,
      scope: {},
      render,
    })
    const disabled = await processPreviewSection({
      sourcePath: 'prompt.mdx',
      source: 'Hello',
      enabled: false,
      nested: false,
      scope: {},
      render,
    })
    const nested = await processPreviewSection({
      sourcePath: 'prompt.mdx',
      source: 'Hello',
      enabled: true,
      nested: true,
      scope: {},
      render,
    })

    expect(md.handled).toBeFalse()
    expect(disabled.handled).toBeFalse()
    expect(nested.handled).toBeFalse()
    expect(rendered).toEqual([])
  })

  it('compiles and renders supported MDX', async () => {
    const rendered: string[] = []

    const result = await processPreviewSection({
      sourcePath: 'prompt.mdx',
      source: 'Hello {profile.name}',
      enabled: true,
      nested: false,
      scope: {profile: {name: 'TNMSO'}},
      render: markdown => {
        rendered.push(markdown)
      },
    })

    expect(result.handled).toBeTrue()
    expect(rendered[0]).toContain('Hello TNMSO')
  })

  it('fails open on parse and render errors', async () => {
    const parseResult = await processPreviewSection({
      sourcePath: 'prompt.mdx',
      source: '<Md when={true}>Unclosed',
      enabled: true,
      nested: false,
      scope: {},
      render: () => {
        throw new Error('must not render invalid MDX')
      },
    })
    const renderResult = await processPreviewSection({
      sourcePath: 'prompt.mdx',
      source: 'Hello',
      enabled: true,
      nested: false,
      scope: {},
      render: () => {
        throw new Error('renderer failed')
      },
    })

    expect(parseResult.handled).toBeFalse()
    expect(parseResult.diagnostics.some(diagnostic => diagnostic.code === 'parse-error')).toBeTrue()
    expect(renderResult.handled).toBeFalse()
    expect(renderResult.diagnostics.some(diagnostic => diagnostic.code === 'render-error')).toBeTrue()
  })
})
