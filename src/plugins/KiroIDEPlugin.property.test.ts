/**
 * Property-based tests for KiroIDEPlugin
 * **Feature: plugin-architecture, Property 10: Kiro file pattern generation**
 * **Validates: Requirements 33.2**
 */

import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { InputType } from '../core/types'
import type { InputBundle, PluginContext } from '../core/types'
import {
  generateKiroFileMatchPattern,
  generateKiroOutputFilename,
} from './KiroIDEPlugin'

/**
 * Generate a valid path segment (alphanumeric with underscores and hyphens)
 * Excludes special characters that would be invalid in file paths
 */
const pathSegmentArb = fc.string({ minLength: 1, maxLength: 20 })
  .filter((s) => /^[a-zA-Z][a-zA-Z0-9_\-]*$/.test(s))

/**
 * Generate a valid relative file path with multiple segments
 */
const relativePathArb = fc.array(pathSegmentArb, { minLength: 0, maxLength: 4 })
  .map((segments) => {
    if (segments.length === 0) {
      return 'AGENTS.md'
    }
    return [...segments, 'AGENTS.md'].join('/')
  })

/**
 * Generate a valid InputBundle for testing
 */
const inputBundleArb = (type: InputType) => relativePathArb.map((path): InputBundle => ({
  type,
  path,
  content: '# Test Content\n\nThis is test content.',
}))

/**
 * Create a mock PluginContext for testing
 */
function createMockContext(): PluginContext {
  return {
    log: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    fs: {
      readFile: async () => '',
      writeFile: async () => {},
      exists: async () => false,
      ensureDir: async () => {},
      copy: async () => {},
      remove: async () => {},
      cleanDir: async () => {},
    },
    path: {
      join: (...segments: string[]) => segments.join('/'),
      resolve: (...segments: string[]) => segments.join('/'),
      relative: (from: string, to: string) => to.replace(from, '').replace(/^\//, ''),
      dirname: (p: string) => p.split('/').slice(0, -1).join('/') || '.',
      basename: (p: string) => p.split('/').pop() ?? '',
      extname: (p: string) => {
        const base = p.split('/').pop() ?? ''
        const idx = base.lastIndexOf('.')
        return idx > 0 ? base.slice(idx) : ''
      },
      normalize: (p: string) => p,
      isAbsolute: (p: string) => p.startsWith('/'),
      sep: '/',
    },
    paths: {
      root: '/test',
      dist: '/test/dist',
      ref: '/test/ref',
      userHome: '/home/user',
      resolve: (...segments: string[]) => ['', 'test', ...segments].join('/'),
    },
    targets: {
      workspace: () => '/test/workspace',
      project: () => '/test/project',
      globalConfig: () => '/test/global',
    },
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    },
    config: { plugins: [] },
    mode: { dryRun: false, cleanOnly: false },
    getInputBundles: () => [],
    getAllInputBundles: () => [],
    capabilities: {
      frontMatter: {
        parse: () => ({ frontMatter: {}, body: '' }),
        serialize: () => '',
        merge: () => ({}),
        generateByType: () => ({}),
      },
      blankLineCleaner: { clean: (s: string) => s },
      contentInjection: {
        prepend: (c: string) => c,
        append: (c: string) => c,
      },
      codeBlockTransform: {
        extract: () => [],
        transformJson: (s: string) => s,
        reassemble: (s: string) => s,
      },
    },
    emitFile: () => '',
    getEmittedFiles: () => [],
    meta: {},
    registry: {
      set: () => {},
      get: () => undefined,
      has: () => false,
      getRequired: () => { throw new Error('Not found') },
    },
    resolveOutputPaths: () => ({}),
  } as unknown as PluginContext
}

describe('KiroIDEPlugin properties', () => {
  describe('Property 10: Kiro file pattern generation', () => {
    it('should generate valid glob patterns for all paths', () => {
      /**
       * **Feature: plugin-architecture, Property 10: Kiro file pattern generation**
       * **Validates: Requirements 33.2**
       *
       * For any valid InputBundle path, the generated pattern should be a valid
       * glob pattern that starts with ** / (recursive match)
       */
      fc.assert(
        fc.property(
          inputBundleArb(InputType.MEMORY_PROMPT),
          (bundle) => {
            const ctx = createMockContext()
            const pattern = generateKiroFileMatchPattern(bundle, ctx)

            // Pattern should be a non-empty string
            expect(pattern).toBeTruthy()
            expect(typeof pattern).toBe('string')

            // Pattern should start with **/ for recursive matching
            expect(pattern.startsWith('**/')).toBe(true)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should generate patterns that contain the source directory', () => {
      /**
       * **Feature: plugin-architecture, Property 10: Kiro file pattern generation**
       * **Validates: Requirements 33.2**
       *
       * For any InputBundle with a non-root path, the generated pattern should
       * contain the source directory path
       */
      fc.assert(
        fc.property(
          fc.array(pathSegmentArb, { minLength: 1, maxLength: 4 })
            .map((segments) => ({
              type: InputType.MEMORY_PROMPT,
              path: [...segments, 'AGENTS.md'].join('/'),
              content: '# Test',
            } as InputBundle)),
          (bundle) => {
            const ctx = createMockContext()
            const pattern = generateKiroFileMatchPattern(bundle, ctx)
            const dir = bundle.path.split('/').slice(0, -1).join('/')

            // Pattern should contain the directory path
            expect(pattern).toContain(dir)
          },
        ),
        { numRuns: 100 },
      )
    })


    it('should generate recursive glob pattern for root-level files', () => {
      /**
       * **Feature: plugin-architecture, Property 10: Kiro file pattern generation**
       * **Validates: Requirements 33.2**
       *
       * For root-level files (no directory), the pattern should match all files
       */
      const rootBundle: InputBundle = {
        type: InputType.MEMORY_PROMPT,
        path: 'AGENTS.md',
        content: '# Root content',
      }

      const ctx = createMockContext()
      const pattern = generateKiroFileMatchPattern(rootBundle, ctx)
      expect(pattern).toBe('**/*')
    })

    it('should use forward slashes in patterns regardless of input', () => {
      /**
       * **Feature: plugin-architecture, Property 10: Kiro file pattern generation**
       * **Validates: Requirements 33.2**
       *
       * Patterns should always use forward slashes for cross-platform compatibility
       */
      fc.assert(
        fc.property(
          inputBundleArb(InputType.MEMORY_PROMPT),
          (bundle) => {
            const ctx = createMockContext()
            const pattern = generateKiroFileMatchPattern(bundle, ctx)

            // Pattern should not contain backslashes
            expect(pattern).not.toContain('\\')
          },
        ),
        { numRuns: 100 },
      )
    })
  })


  describe('Kiro output filename generation', () => {
    it('should generate valid filenames for all paths', () => {
      /**
       * **Feature: plugin-architecture, Property 10: Kiro file pattern generation**
       * **Validates: Requirements 33.2**
       *
       * For any valid InputBundle path, the generated filename should be a valid
       * .md filename without path separators
       */
      fc.assert(
        fc.property(
          inputBundleArb(InputType.MEMORY_PROMPT),
          (bundle) => {
            const ctx = createMockContext()
            const filename = generateKiroOutputFilename(bundle, ctx)

            // Filename should be a non-empty string
            expect(filename).toBeTruthy()
            expect(typeof filename).toBe('string')

            // Filename should end with .md
            expect(filename.endsWith('.md')).toBe(true)

            // Filename should not contain path separators
            expect(filename).not.toContain('/')
            expect(filename).not.toContain('\\')
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should generate _root.md for root-level files', () => {
      /**
       * **Feature: plugin-architecture, Property 10: Kiro file pattern generation**
       * **Validates: Requirements 33.2**
       *
       * For root-level files (no directory), the filename should be _root.md
       */
      const rootBundle: InputBundle = {
        type: InputType.MEMORY_PROMPT,
        path: 'AGENTS.md',
        content: '# Root content',
      }

      const ctx = createMockContext()
      const filename = generateKiroOutputFilename(rootBundle, ctx)
      expect(filename).toBe('_root.md')
    })

    it('should generate unique filenames for different paths', () => {
      /**
       * **Feature: plugin-architecture, Property 10: Kiro file pattern generation**
       * **Validates: Requirements 33.2**
       *
       * Different directory paths should produce different output filenames
       */
      fc.assert(
        fc.property(
          pathSegmentArb,
          pathSegmentArb.filter((s) => s.length > 0),
          (seg1, seg2) => {
            // Skip if segments are the same
            fc.pre(seg1 !== seg2)

            const bundle1: InputBundle = {
              type: InputType.MEMORY_PROMPT,
              path: `${seg1}/AGENTS.md`,
              content: '# Test',
            }

            const bundle2: InputBundle = {
              type: InputType.MEMORY_PROMPT,
              path: `${seg2}/AGENTS.md`,
              content: '# Test',
            }

            const ctx = createMockContext()
            const filename1 = generateKiroOutputFilename(bundle1, ctx)
            const filename2 = generateKiroOutputFilename(bundle2, ctx)

            expect(filename1).not.toBe(filename2)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should convert path separators to underscores', () => {
      /**
       * **Feature: plugin-architecture, Property 10: Kiro file pattern generation**
       * **Validates: Requirements 33.2**
       *
       * Directory separators in paths should be converted to underscores
       */
      fc.assert(
        fc.property(
          fc.array(pathSegmentArb, { minLength: 2, maxLength: 4 })
            .map((segments) => ({
              type: InputType.MEMORY_PROMPT,
              path: [...segments, 'AGENTS.md'].join('/'),
              content: '# Test',
            } as InputBundle)),
          (bundle) => {
            const ctx = createMockContext()
            const filename = generateKiroOutputFilename(bundle, ctx)

            // Filename should contain underscores (from path conversion)
            // unless it's a single-segment path
            const segments = bundle.path.split('/').slice(0, -1)
            if (segments.length > 1) {
              expect(filename).toContain('_')
            }
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
