import {describe, expect, it} from 'vitest'
import {mdxToMd} from './mdx-to-md'

describe('mdxToMd wrapper', () => {
  it('falls back when native extractMetadata leaves export default in content', async () => {
    const content = `export default {
  name: "default-skill",
  description: "A skill using export default",
  keywords: ["test", "default"]
}

# Default Export Skill

This is content.`

    const result = await mdxToMd(content, {extractMetadata: true})

    expect(result.content).toContain('# Default Export Skill')
    expect(result.content).not.toContain('export default')
    expect(result.metadata.source).toBe('export')
    expect(result.metadata.fields).toEqual({
      name: 'default-skill',
      description: 'A skill using export default',
      keywords: ['test', 'default']
    })
  })

  it('serializes URL-labeled links as a single valid link shape', async () => {
    const content = 'Open [http://localhost:9002](http://localhost:9002) in your browser.'

    const result = await mdxToMd(content)

    expect(result).not.toContain('[[')
    expect(result).not.toContain(']](')
    expect(result).toBe('Open <http://localhost:9002> in your browser.')
  })

  it('keeps non-URL self-labeled links in bracketed form', async () => {
    const result = await mdxToMd('[README](README) and [#section](#section)')

    expect(result).toBe('[README](README) and [#section](#section)')
  })

  it('keeps formatted URL labels instead of collapsing them into autolinks', async () => {
    const result = await mdxToMd('[**http://localhost:9002**](http://localhost:9002)')

    expect(result).toBe('[**http://localhost:9002**](http://localhost:9002)')
  })

  it('evaluates preserved intrinsic HTML before serializing', async () => {
    const result = await mdxToMd('<p align={side}>{count}<img src={logo} width={width} /></p>', {
      scope: {
        side: 'right',
        count: 2,
        logo: './logo.svg',
        width: 138
      }
    })

    expect(result).toBe('<p align="right">2<img src="./logo.svg" width="138" /></p>')
  })
})
