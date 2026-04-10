import {describe, expect, it} from 'vitest'
import {assertNoResidualModuleSyntax} from './DistPromptGuards'

describe('dist prompt guards', () => {
  it('allows ordinary markdown content', () => {
    expect(() => assertNoResidualModuleSyntax('# Title\n\nBody text', '/tmp/demo.mdx')).not.toThrow()
  })

  it('rejects bare module syntax outside fenced code blocks', () => {
    expect(() => assertNoResidualModuleSyntax('export default\n\n# Title', '/tmp/demo.mdx')).toThrow(
      'Compiled prompt still contains residual module syntax'
    )
  })

  it('ignores module syntax inside fenced code blocks', () => {
    expect(() => assertNoResidualModuleSyntax([
      '```ts',
      'export default {name: "demo"}',
      '```'
    ].join('\n'), '/tmp/demo.mdx')).not.toThrow()
  })
})
