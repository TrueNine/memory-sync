/**
 * Property-based tests for Transform Chain
 * **Feature: plugin-architecture, Property 5: Transform chain propagation**
 */

import type { Plugin, TransformResult } from '../core/types'
import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { PluginRunner } from '@/core'

/**
 * Create a transform plugin that appends a marker to content
 */
function createMarkerPlugin(name: string, marker: string): Plugin {
  return {
    name,
    transform(code: string): TransformResult {
      return { code: code + marker }
    },
  }
}

/**
 * Create a transform plugin that records what it receives
 */
function createRecordingPlugin(
  name: string,
  receivedInputs: string[],
  outputSuffix: string,
): Plugin {
  return {
    name,
    transform(code: string): TransformResult {
      receivedInputs.push(code)
      return { code: code + outputSuffix }
    },
  }
}

describe('Transform Chain properties', () => {
  describe('Property 5: Transform chain propagation', () => {
    it('should pass transformed content to subsequent plugins', () => {
      /**
       * **Feature: plugin-architecture, Property 5: Transform chain propagation**
       * **Validates: Requirements 4.3**
       *
       * For any content and sequence of transform plugins, each plugin should
       * receive the output of the previous plugin
       */
      fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 100 })
            .filter((s) => !s.includes('\n')),
          fc.array(
            fc.string({ minLength: 1, maxLength: 10 })
              .filter((s) => /^[a-zA-Z0-9]+$/.test(s)),
            { minLength: 2, maxLength: 5 },
          ),
          async (initialContent, markers) => {
            const runner = new PluginRunner({ plugins: [] })

            for (let i = 0; i < markers.length; i++) {
              runner.register(createMarkerPlugin(`plugin-${i}`, markers[i] as string))
            }

            await runner.run()

            const expectedContent = initialContent + markers.join('')
            const transformedContent = await runTransformChain(
              runner,
              initialContent,
              'test.md',
            )

            expect(transformedContent).toBe(expectedContent)
          },
        ),
        { numRuns: 50 },
      )
    })

    it('should preserve order of transformations', () => {
      /**
       * **Feature: plugin-architecture, Property 5: Transform chain propagation**
       * **Validates: Requirements 4.3**
       */
      fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 })
            .filter((s) => !s.includes('\n')),
          async (initialContent) => {
            const receivedByA: string[] = []
            const receivedByB: string[] = []
            const receivedByC: string[] = []

            const runner = new PluginRunner({ plugins: [] })
            runner.register(createRecordingPlugin('plugin-a', receivedByA, '[A]'))
            runner.register(createRecordingPlugin('plugin-b', receivedByB, '[B]'))
            runner.register(createRecordingPlugin('plugin-c', receivedByC, '[C]'))

            await runner.run()

            const finalContent = await runTransformChain(
              runner,
              initialContent,
              'test.md',
            )

            expect(receivedByA[0]).toBe(initialContent)
            expect(receivedByB[0]).toBe(initialContent + '[A]')
            expect(receivedByC[0]).toBe(initialContent + '[A][B]')
            expect(finalContent).toBe(initialContent + '[A][B][C]')
          },
        ),
        { numRuns: 50 },
      )
    })

    it('should skip plugins that return null', () => {
      /**
       * **Feature: plugin-architecture, Property 5: Transform chain propagation**
       * **Validates: Requirements 4.3**
       */
      fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 })
            .filter((s) => !s.includes('\n')),
          async (initialContent) => {
            const runner = new PluginRunner({ plugins: [] })

            runner.register({
              name: 'plugin-a',
              transform(code: string): TransformResult {
                return { code: code + '[A]' }
              },
            })

            runner.register({
              name: 'plugin-skip',
              transform(): TransformResult | null {
                return null
              },
            })

            runner.register({
              name: 'plugin-b',
              transform(code: string): TransformResult {
                return { code: code + '[B]' }
              },
            })

            await runner.run()

            const finalContent = await runTransformChain(
              runner,
              initialContent,
              'test.md',
            )

            expect(finalContent).toBe(initialContent + '[A][B]')
          },
        ),
        { numRuns: 50 },
      )
    })
  })

  describe('Property 5: Transform chain error handling', () => {
    it('should preserve original input when transform fails with onError continue', () => {
      /**
       * **Feature: plugin-architecture, Property 5: Transform chain propagation**
       * **Validates: Requirements 3.3**
       *
       * For any content, when a transform plugin fails, the chain should
       * preserve the content from before the failure and continue
       */
      fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 })
            .filter((s) => !s.includes('\n')),
          async (initialContent) => {
            const runner = new PluginRunner({
              plugins: [],
              options: { onError: 'continue' },
            })

            // First plugin transforms successfully
            runner.register({
              name: 'plugin-a',
              transform(code: string): TransformResult {
                return { code: code + '[A]' }
              },
            })

            // Second plugin throws error
            runner.register({
              name: 'plugin-fail',
              transform(): TransformResult {
                throw new Error('Transform failed')
              },
            })

            // Third plugin should still receive content from plugin-a
            runner.register({
              name: 'plugin-b',
              transform(code: string): TransformResult {
                return { code: code + '[B]' }
              },
            })

            await runner.run()

            const finalContent = await runTransformChain(
              runner,
              initialContent,
              'test.md',
            )

            // Content should include [A] and [B], failure preserved intermediate state
            expect(finalContent).toBe(initialContent + '[A][B]')
          },
        ),
        { numRuns: 50 },
      )
    })

    it('should provide summary of changes made', () => {
      /**
       * **Feature: plugin-architecture, Property 5: Transform chain propagation**
       * **Validates: Requirements 3.4**
       *
       * For any content and transform plugins, the runner should provide
       * a summary of all transformations applied
       */
      fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 })
            .filter((s) => !s.includes('\n')),
          fc.array(
            fc.string({ minLength: 1, maxLength: 5 })
              .filter((s) => /^[a-zA-Z0-9]+$/.test(s)),
            { minLength: 1, maxLength: 3 },
          ),
          async (initialContent, markers) => {
            const runner = new PluginRunner({ plugins: [] })

            for (let i = 0; i < markers.length; i++) {
              runner.register(createMarkerPlugin(`plugin-${i}`, markers[i] as string))
            }

            await runner.run()
            await runner.runTransform(initialContent, 'test.md')

            const summary = runner.getTransformSummary()

            expect(summary).not.toBeNull()
            expect(summary!.originalLength).toBe(initialContent.length)
            expect(summary!.transformations.length).toBe(markers.length)
            expect(summary!.success).toBe(true)
            expect(summary!.errors.length).toBe(0)

            // Verify each transformation record
            let expectedInputLength = initialContent.length
            for (let i = 0; i < markers.length; i++) {
              const record = summary!.transformations[i]
              expect(record?.pluginName).toBe(`plugin-${i}`)
              expect(record?.inputLength).toBe(expectedInputLength)
              expect(record?.changed).toBe(true)
              expectedInputLength = record?.outputLength ?? expectedInputLength
            }
          },
        ),
        { numRuns: 50 },
      )
    })

    it('should record errors in summary when transform fails', () => {
      /**
       * **Feature: plugin-architecture, Property 5: Transform chain propagation**
       * **Validates: Requirements 3.3, 3.4**
       *
       * For any content, when a transform plugin fails, the summary should
       * record the error with plugin context
       */
      fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 })
            .filter((s) => !s.includes('\n')),
          fc.string({ minLength: 1, maxLength: 20 })
            .filter((s) => /^[a-zA-Z0-9 ]+$/.test(s)),
          async (initialContent, errorMessage) => {
            const runner = new PluginRunner({
              plugins: [],
              options: { onError: 'continue' },
            })

            runner.register({
              name: 'plugin-a',
              transform(code: string): TransformResult {
                return { code: code + '[A]' }
              },
            })

            runner.register({
              name: 'failing-plugin',
              transform(): TransformResult {
                throw new Error(errorMessage)
              },
            })

            await runner.run()
            await runner.runTransform(initialContent, 'test.md')

            const summary = runner.getTransformSummary()

            expect(summary).not.toBeNull()
            expect(summary!.success).toBe(false)
            expect(summary!.errors.length).toBe(1)
            expect(summary!.errors[0]?.pluginName).toBe('failing-plugin')
            expect(summary!.errors[0]?.message).toBe(errorMessage)
          },
        ),
        { numRuns: 50 },
      )
    })

    it('should chain transformations in priority order', () => {
      /**
       * **Feature: plugin-architecture, Property 5: Transform chain propagation**
       * **Validates: Requirements 3.2**
       *
       * For any set of plugins with different priorities, transformations
       * should be applied in priority order (lower priority first)
       */
      fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 })
            .filter((s) => !s.includes('\n')),
          async (initialContent) => {
            const runner = new PluginRunner({ plugins: [] })

            // Register plugins in reverse priority order
            runner.register({
              name: 'plugin-c',
              priority: 300,
              transform(code: string): TransformResult {
                return { code: code + '[C]' }
              },
            })

            runner.register({
              name: 'plugin-a',
              priority: 100,
              transform(code: string): TransformResult {
                return { code: code + '[A]' }
              },
            })

            runner.register({
              name: 'plugin-b',
              priority: 200,
              transform(code: string): TransformResult {
                return { code: code + '[B]' }
              },
            })

            await runner.run()

            const finalContent = await runTransformChain(
              runner,
              initialContent,
              'test.md',
            )

            // Should be in priority order: A, B, C
            expect(finalContent).toBe(initialContent + '[A][B][C]')
          },
        ),
        { numRuns: 50 },
      )
    })
  })
})

/**
 * Helper function to run transform chain on content
 */
async function runTransformChain(
  runner: PluginRunner,
  content: string,
  id: string,
): Promise<string> {
  const result = await runner.runTransform(content, id)
  return result ? result.code : content
}
