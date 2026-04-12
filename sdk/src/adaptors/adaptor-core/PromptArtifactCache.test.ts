import type {
  clearPromptArtifactCache as ClearPromptArtifactCacheFn,
  compileRawPromptArtifact as CompileRawPromptArtifactFn,
  readPromptArtifact as ReadPromptArtifactFn
} from './PromptArtifactCache'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {beforeEach, describe, expect, it, vi} from 'vitest'

const {mdxToMdMock, parseMarkdownMock} = vi.hoisted(() => ({
  mdxToMdMock: vi.fn(async (content: string) => ({
    content: `compiled:${content.trim()}`,
    metadata: {
      fields: {
        compiled: true
      }
    }
  })),
  parseMarkdownMock: vi.fn((content: string) => {
    const frontMatterMatch = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/u.exec(content)

    if (frontMatterMatch != null) {
      const rawFrontMatter = `---\n${frontMatterMatch[1]}\n---`
      const markdownContent = frontMatterMatch[2].trim()

      return {
        yamlFrontMatter: {
          title: 'frontmatter'
        },
        rawFrontMatter,
        contentWithoutFrontMatter: markdownContent,
        markdownAst: {
          type: 'root'
        },
        markdownContents: [markdownContent]
      }
    }

    const trimmed = content.trim()
    return {
      yamlFrontMatter: void 0,
      rawFrontMatter: void 0,
      contentWithoutFrontMatter: trimmed,
      markdownAst: {
        type: 'root'
      },
      markdownContents: [trimmed]
    }
  })
}))

vi.mock('@/md-compiler', () => ({
  mdxToMd: mdxToMdMock
}))

vi.mock('@/md-compiler/markdown', () => ({
  parseMarkdown: parseMarkdownMock
}))

async function loadPromptArtifactCache() {
  const mod = await import('./PromptArtifactCache')
  return {
    clearPromptArtifactCache: mod.clearPromptArtifactCache,
    compileRawPromptArtifact: mod.compileRawPromptArtifact,
    readPromptArtifact: mod.readPromptArtifact
  }
}

let clearPromptArtifactCache: typeof ClearPromptArtifactCacheFn
let compileRawPromptArtifact: typeof CompileRawPromptArtifactFn
let readPromptArtifact: typeof ReadPromptArtifactFn

beforeEach(async () => {
  vi.resetModules()
  const mod = await loadPromptArtifactCache()
  clearPromptArtifactCache = mod.clearPromptArtifactCache
  compileRawPromptArtifact = mod.compileRawPromptArtifact
  readPromptArtifact = mod.readPromptArtifact
  clearPromptArtifactCache()
  vi.clearAllMocks()
})

describe('prompt artifact cache', () => {
  it('caches repeated source prompt compilation by file mtime', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-prompt-cache-source-'))
    const filePath = path.join(tempDir, 'prompt.src.mdx')

    try {
      fs.writeFileSync(filePath, 'Hello prompt', 'utf8')

      const first = await readPromptArtifact(filePath, {
        mode: 'source'
      })
      const second = await readPromptArtifact(filePath, {
        mode: 'source'
      })

      expect(first.content).toBe('compiled:Hello prompt')
      expect(second.content).toBe('compiled:Hello prompt')
      expect(mdxToMdMock).toHaveBeenCalledTimes(1)
    }
    finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })

  it('reads export-default dist artifacts without recompiling', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-prompt-cache-dist-'))
    const filePath = path.join(tempDir, 'prompt.mdx')

    try {
      fs.writeFileSync(filePath, [
        'export default {',
        '  description: \'dist description\',',
        '  version: \'1.0.0\'',
        '}',
        '',
        'Compiled body',
        ''
      ].join('\n'), 'utf8')

      const artifact = await readPromptArtifact(filePath, {
        mode: 'dist'
      })

      expect(artifact.content).toBe('Compiled body')
      expect(artifact.metadata).toEqual({
        description: 'dist description',
        version: '1.0.0'
      })
      expect(mdxToMdMock).not.toHaveBeenCalled()
    }
    finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })

  it('still compiles frontmatter dist artifacts so MDX body syntax is resolved', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-prompt-cache-frontmatter-dist-'))
    const filePath = path.join(tempDir, 'prompt.mdx')

    try {
      fs.writeFileSync(filePath, [
        '---',
        'title: demo',
        '---',
        '',
        'Hello {profile.name}',
        ''
      ].join('\n'), 'utf8')

      const artifact = await readPromptArtifact(filePath, {
        mode: 'dist'
      })

      expect(artifact.content).toContain('compiled:')
      expect(artifact.metadata).toEqual({
        compiled: true
      })
      expect(mdxToMdMock).toHaveBeenCalledTimes(1)
    }
    finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })

  it('keeps plain dist markdown as-is when it does not contain MDX syntax', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-prompt-cache-plain-dist-'))
    const filePath = path.join(tempDir, 'prompt.mdx')

    try {
      fs.writeFileSync(filePath, '- **Small projects (<100,000 RMB)**: Keep it simple\n', 'utf8')

      const artifact = await readPromptArtifact(filePath, {
        mode: 'dist'
      })

      expect(artifact.content).toBe('- **Small projects (<100,000 RMB)**: Keep it simple\n')
      expect(artifact.metadata).toEqual({})
      expect(mdxToMdMock).not.toHaveBeenCalled()
    }
    finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })

  it('falls back to mdx compilation when export-default metadata is not JSON5-compatible', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-prompt-cache-dist-fallback-'))
    const filePath = path.join(tempDir, 'prompt.mdx')

    try {
      fs.writeFileSync(filePath, [
        'export default {',
        '  description: `template literal metadata`,',
        '}',
        '',
        'Compiled body',
        ''
      ].join('\n'), 'utf8')

      const artifact = await readPromptArtifact(filePath, {
        mode: 'dist'
      })

      expect(artifact.content).toContain('compiled:export default')
      expect(mdxToMdMock).toHaveBeenCalledTimes(1)
    }
    finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })

  it('caches raw prompt recompilation for identical tool preset inputs', async () => {
    const resultA = await compileRawPromptArtifact({
      filePath: '/tmp/command.mdx',
      rawMdx: 'Tool preset body',
      cacheMtimeMs: 42,
      globalScope: {
        tool: {
          preset: 'demo'
        }
      } as never
    })
    const resultB = await compileRawPromptArtifact({
      filePath: '/tmp/command.mdx',
      rawMdx: 'Tool preset body',
      cacheMtimeMs: 42,
      globalScope: {
        tool: {
          preset: 'demo'
        }
      } as never
    })

    expect(resultA.content).toBe('compiled:Tool preset body')
    expect(resultB.content).toBe('compiled:Tool preset body')
    expect(mdxToMdMock).toHaveBeenCalledTimes(1)
  })
})
