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
})
