import * as fc from 'fast-check'
import {describe, expect, it} from 'vitest'
import {parseMdx} from './parser'

describe('parseMdx property tests', () => {
  describe('property 2: parseMdx produces valid AST', () => {
    /** Plain markdown text: headings, paragraphs, lists, emphasis */
    const plainMarkdownArb = fc.oneof(
      fc.constantFrom(
        '# Heading 1',
        '## Heading 2',
        '### Heading 3',
        'A simple paragraph.',
        '- item one\n- item two',
        '1. first\n2. second',
        '**bold text**',
        '*italic text*',
        '> blockquote',
        '```\ncode block\n```',
        '[link](https://example.com)',
        '---',
        '| a | b |\n| --- | --- |\n| 1 | 2 |'
      ),
      // eslint-disable-next-line regexp/use-ignore-case -- fast-check stringMatching does not support the i flag
      fc.stringMatching(/^[A-Za-z0-9 ,.!?]{1,60}$/)
    )

    /** JS reserved words that would make acorn throw when used in MDX expressions like {do} */
    const jsReservedInExpression = new Set([
      'do',
      'if',
      'in',
      'for',
      'let',
      'new',
      'try',
      'var',
      'case',
      'else',
      'enum',
      'null',
      'break',
      'catch',
      'class',
      'const',
      'super',
      'throw',
      'while',
      'with',
      'yield',
      'delete',
      'export',
      'import',
      'return',
      'typeof',
      'default',
      'finally',
      'extends',
      'switch',
      'function',
      'continue',
      'debugger',
      'interface',
      'package',
      'private',
      'protected',
      'public',
      'static',
      'implements',
      'instanceof'
    ])
    /** MDX expression strings like `{variable}` or `{1 + 2}` (exclude reserved words so acorn does not throw) */
    const mdxExpressionArb = fc.oneof(
      fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,9}$/)
        .filter(v => !jsReservedInExpression.has(v))
        .map(v => `{${v}}`),
      fc.integer({min: -100, max: 100}).map(n => `{${n}}`),
      fc.constant('{true}'),
      fc.constant('{false}'),
      fc.constant('{"hello"}')
    )

    /** MDX JSX elements: self-closing and with children */
    const jsxElementArb = fc.stringMatching(/^[A-Z][a-zA-Z0-9]{0,8}$/).chain(tag =>
      fc.oneof(
        fc.constant(`<${tag} />`),
        fc.constant(`<${tag}>content</${tag}>`),
        fc.constant(`<${tag} prop="value" />`)
      ))

    /** YAML frontmatter block */
    const frontmatterArb = fc.record({
      // eslint-disable-next-line regexp/use-ignore-case -- fast-check stringMatching does not support the i flag
      title: fc.stringMatching(/^[A-Za-z0-9 ]{1,20}$/),
      draft: fc.boolean()
    }).map(({title, draft}) => `---\ntitle: ${title}\ndraft: ${draft}\n---`)

    /** Compose a full MDX string from various parts */
    const mdxStringArb = fc.array(
      fc.oneof(
        {weight: 4, arbitrary: plainMarkdownArb},
        {weight: 2, arbitrary: mdxExpressionArb},
        {weight: 2, arbitrary: jsxElementArb},
        {weight: 1, arbitrary: frontmatterArb}
      ),
      {minLength: 0, maxLength: 6}
    ).map(parts => parts.join('\n\n'))

    it('should always return an object with type "root" and a children array', () => {
      fc.assert(
        fc.property(
          mdxStringArb,
          mdxSource => {
            const ast = parseMdx(mdxSource)

            expect(ast).toBeDefined()
            expect(ast.type).toBe('root')
            expect(Array.isArray(ast.children)).toBe(true)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should return root with children array for empty input', () => {
      const ast = parseMdx('')

      expect(ast.type).toBe('root')
      expect(Array.isArray(ast.children)).toBe(true)
      expect(ast.children).toHaveLength(0)
    })

    it('should return root with children array for plain markdown strings', () => {
      fc.assert(
        fc.property(
          plainMarkdownArb,
          md => {
            const ast = parseMdx(md)

            expect(ast.type).toBe('root')
            expect(Array.isArray(ast.children)).toBe(true)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should return root with children array for MDX with expressions', () => {
      fc.assert(
        fc.property(
          mdxExpressionArb,
          expr => {
            const ast = parseMdx(expr)

            expect(ast.type).toBe('root')
            expect(Array.isArray(ast.children)).toBe(true)
            expect(ast.children.length).toBeGreaterThan(0)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should return root with children array for MDX with JSX elements', () => {
      fc.assert(
        fc.property(
          jsxElementArb,
          jsx => {
            const ast = parseMdx(jsx)

            expect(ast.type).toBe('root')
            expect(Array.isArray(ast.children)).toBe(true)
            expect(ast.children.length).toBeGreaterThan(0)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should return root with children array for MDX with frontmatter', () => {
      fc.assert(
        fc.property(
          frontmatterArb,
          fm => {
            const ast = parseMdx(fm)

            expect(ast.type).toBe('root')
            expect(Array.isArray(ast.children)).toBe(true)
            expect(ast.children.length).toBeGreaterThan(0)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should produce children that are all valid MDAST node objects', () => {
      fc.assert(
        fc.property(
          mdxStringArb,
          mdxSource => {
            const ast = parseMdx(mdxSource)

            for (const child of ast.children) {
              expect(child).toBeDefined()
              expect(typeof child.type).toBe('string')
              expect(child.type.length).toBeGreaterThan(0)
            }
          }
        ),
        {numRuns: 100}
      )
    })
  })
})
