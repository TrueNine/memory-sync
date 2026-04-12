import * as path from 'node:path'
import {describe, expect, it} from 'vitest'
import {UndefinedNamespaceError} from '@/md-compiler/errors'
import {
  formatPromptCompilerDiagnostic,
  resolveSourcePathForDistFile
} from './PromptCompilerDiagnostics'

describe('prompt compiler diagnostics', () => {
  it('formats prompt-aware compiler diagnostics with dist and src paths', () => {
    const error = new UndefinedNamespaceError('TODO', 'TODO', {
      filePath: path.join('C:', 'repo', 'aindex', 'dist', 'skills', 'demo', 'examples', 'guide.mdx'),
      sourceText: 'never leave placeholders or "{TODO}" markers',
      position: {
        start: {line: 1, column: 30, offset: 29},
        end: {line: 1, column: 36, offset: 35}
      },
      nodeType: 'mdxTextExpression'
    })

    const message = formatPromptCompilerDiagnostic(error, {
      operation: 'Failed to compile skill child doc.',
      promptKind: 'skill-child-doc',
      logicalName: 'demo/examples/guide',
      entryDistPath: path.join('C:', 'repo', 'aindex', 'dist', 'skills', 'demo', 'skill.mdx'),
      distPath: path.join('C:', 'repo', 'aindex', 'dist', 'skills', 'demo', 'examples', 'guide.mdx'),
      srcPath: path.join('C:', 'repo', 'aindex', 'skills', 'demo', 'examples', 'guide.src.mdx')
    })

    expect(message).toContain('prompt kind: skill-child-doc')
    expect(message).toContain('logical name: demo/examples/guide')
    expect(message).toContain('entry dist file:')
    expect(message).toContain('dist file:')
    expect(message).toContain('src file:')
    expect(message).toContain('location: 1:30-1:36')
    expect(message).toContain('source line: never leave placeholders or "{TODO}" markers')
  })

  it('maps nested dist child docs back to src child docs', () => {
    const mapped = resolveSourcePathForDistFile(path, path.join('C:', 'repo', 'aindex', 'dist', 'skills', 'demo', 'examples', 'guide.mdx'), {
      distRootDir: path.join('C:', 'repo', 'aindex', 'dist', 'skills', 'demo'),
      srcRootDir: path.join('C:', 'repo', 'aindex', 'skills', 'demo')
    })

    expect(mapped).toBe(path.join('C:', 'repo', 'aindex', 'skills', 'demo', 'examples', 'guide.src.mdx'))
  })
})
