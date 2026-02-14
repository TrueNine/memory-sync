/**
 * Feature: md-compiler-extraction, Property 1: mdxToMd behavioral equivalence
 *
 * Generate random MDX strings with variable expressions and scopes, verify
 * `mdxToMd` produces non-throwing string output containing evaluated scope values.
 *
 * **Validates: Requirements 3.1**
 */

import * as fc from 'fast-check'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {registerBuiltInComponents} from '@/components'
import {clearComponents} from './component-registry'
import {mdxToMd} from './mdx-to-md'

describe('mdxToMd property tests', () => {
  beforeEach(() => registerBuiltInComponents())

  afterEach(() => clearComponents())

  describe('property 1: mdxToMd behavioral equivalence', () => {
    /** JavaScript reserved keywords that should not be used as variable names */
    const reservedKeywords = new Set([
      'break',
      'case',
      'catch',
      'class',
      'const',
      'continue',
      'debugger',
      'default',
      'delete',
      'do',
      'else',
      'export',
      'extends',
      'finally',
      'for',
      'function',
      'if',
      'import',
      'in',
      'instanceof',
      'new',
      'return',
      'super',
      'switch',
      'this',
      'throw',
      'try',
      'typeof',
      'var',
      'void',
      'while',
      'with',
      'yield',
      'enum',
      'await',
      'implements',
      'interface',
      'let',
      'package',
      'private',
      'protected',
      'public',
      'static',
      'null',
      'true',
      'false'
    ])

    /** Generate safe variable names (valid JS identifiers, excluding reserved keywords) */
    const varNameArb = fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,9}$/)
      .filter(name => !reservedKeywords.has(name))

    // eslint-disable-next-line regexp/use-ignore-case -- fast-check stringMatching does not support the i flag
    const scopeStringValueArb = fc.stringMatching(/^[A-Za-z0-9]([A-Za-z0-9 ]{0,18}[A-Za-z0-9])?$/)

    const scopeValueArb = fc.oneof(
      scopeStringValueArb,
      fc.integer({min: -1000, max: 1000}),
      fc.boolean()
    )

    /** Generate a scope object with 1-5 entries of string/number/boolean values */
    const scopeArb = fc.array(
      fc.tuple(varNameArb, scopeValueArb),
      {minLength: 1, maxLength: 5}
    ).map(entries => {
      const scope: Record<string, unknown> = {}
      for (const [key, value] of entries) scope[key] = value
      return scope
    }).filter(scope => Object.keys(scope).length > 0)

    function mdxWithExpressionsArb(scopeKeys: string[]) {
      if (scopeKeys.length === 0) return fc.constant('# Hello')

      // eslint-disable-next-line regexp/use-ignore-case -- fast-check stringMatching does not support the i flag
      const plainTextArb = fc.stringMatching(/^[A-Za-z0-9 ,.!?]{1,30}$/)

      const expressionArb = fc.constantFrom(...scopeKeys)
        .map(key => `{${key}}`)

      return fc.array( // Build an MDX string with interleaved text and expressions
        fc.oneof(
          {weight: 2, arbitrary: plainTextArb},
          {weight: 1, arbitrary: expressionArb}
        ),
        {minLength: 1, maxLength: 6}
      ).map(parts => parts.join(' '))
    }

    it('should produce a string output (never throw) for any valid scope and MDX with expressions', async () => {
      await fc.assert(
        fc.asyncProperty(
          scopeArb.chain(scope => {
            const keys = Object.keys(scope)
            return mdxWithExpressionsArb(keys).map(mdx => ({scope, mdx}))
          }),
          async ({scope, mdx}) => {
            const result = await mdxToMd(mdx, {scope})
            expect(typeof result).toBe('string')
            expect(result.length).toBeGreaterThanOrEqual(0)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should contain evaluated scope values in the output when expressions reference them', async () => {
      await fc.assert(
        fc.asyncProperty(
          scopeArb.chain(scope => {
            const keys = Object.keys(scope)
            const keyArb = fc.constantFrom(...keys) // Generate MDX that uses exactly one variable expression surrounded by markers
            return keyArb.map(key => ({
              scope,
              key,
              mdx: `BEFORE {${key}} AFTER`
            }))
          }),
          async ({scope, key, mdx}) => {
            const result = await mdxToMd(mdx, {scope})
            const expectedValue = String(scope[key])
            expect(result).toContain(expectedValue)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should produce string output for plain markdown without expressions', async () => {
      const plainMarkdownArb = fc.oneof(
        fc.constant('# Heading'),
        fc.constant('Some paragraph text.'),
        fc.constant('- list item 1\n- list item 2'),
        fc.constant('**bold** and *italic*'),
        fc.constant('> blockquote'),
        // eslint-disable-next-line regexp/use-ignore-case -- fast-check stringMatching does not support the i flag
        fc.stringMatching(/^[A-Za-z0-9 ,.!?]{1,50}$/)
      )

      await fc.assert(
        fc.asyncProperty(
          plainMarkdownArb,
          async md => {
            const result = await mdxToMd(md)
            expect(typeof result).toBe('string')
          }
        ),
        {numRuns: 100}
      )
    })

    it('should produce string output with scope containing various value types', async () => {
      await fc.assert(
        fc.asyncProperty(
          varNameArb,
          scopeValueArb,
          async (varName, value) => {
            const mdx = `Value is {${varName}}`
            const scope = {[varName]: value}
            const result = await mdxToMd(mdx, {scope})
            expect(typeof result).toBe('string')
            const expectedValue = String(value).trim() // Markdown processors normalize whitespace, so we trim for comparison. // The output should contain the string representation of the value.
            expect(result).toContain(expectedValue)
          }
        ),
        {numRuns: 100}
      )
    })
  })
})
