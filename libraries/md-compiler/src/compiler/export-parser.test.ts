import {describe, expect, it} from 'vitest'
import {ExportParseError} from '@/errors'
import {parseExports} from './export-parser'
import {parseMdx} from './parser'

function getEsmNodes(source: string) {
  const ast = parseMdx(source)
  return ast.children.filter(node => node.type === 'mdxjsEsm')
}

describe('export-parser diagnostics', () => {
  it('includes file, location, and snippet for export default failures', () => {
    const source = `export default {
  name: dynamicName,
  description: 'demo',
}

# Demo`

    expect(() => parseExports(getEsmNodes(source), {
      filePath: '/tmp/skill.mdx',
      sourceText: source
    })).toThrow(ExportParseError)

    try {
      parseExports(getEsmNodes(source), {
        filePath: '/tmp/skill.mdx',
        sourceText: source
      })
    }
    catch (error) {
      const exportError = error as ExportParseError
      expect(exportError.exportName).toBe('default')
      expect(exportError.filePath).toBe('/tmp/skill.mdx')
      expect(exportError.line).toBe(1)
      expect(exportError.column).toBe(1)
      expect(exportError.snippet).toContain('export default')
      expect(exportError.codeFrame).toContain('1 | export default {')
      expect(exportError.message).toContain('export: default')
      expect(exportError.message).toContain('cause:')
    }
  })

  it('includes file, location, and snippet for named export failures', () => {
    const source = `export const metadata = tool.profile

# Demo`

    try {
      parseExports(getEsmNodes(source), {
        filePath: '/tmp/skill.mdx',
        sourceText: source
      })
    }
    catch (error) {
      const exportError = error as ExportParseError
      expect(exportError.exportName).toBe('metadata')
      expect(exportError.filePath).toBe('/tmp/skill.mdx')
      expect(exportError.line).toBe(1)
      expect(exportError.column).toBe(1)
      expect(exportError.snippet).toContain('export const metadata = tool.profile')
      expect(exportError.message).toContain('Cannot statically evaluate export "metadata"')
      expect(exportError.message).toContain('code frame:')
    }
  })
})
