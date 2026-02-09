/**
 * Feature: mdx-compiler-simplification
 * Property 7: Circular Dependency Detection
 *
 * For any component reference chain that forms a cycle, the compiler SHALL detect
 * the circular dependency and throw a descriptive error before infinite recursion occurs.
 *
 * Validates: Requirements 5.4
 */

import type {Root, RootContent} from 'mdast'
import type {MdxJsxFlowElement, MdxJsxTextElement} from 'mdast-util-mdx'
import type {ComponentHandler, ProcessingContext} from './types'
import * as fc from 'fast-check'
import {afterEach, describe, expect, it} from 'vitest'
import {processComponent} from './component-processor'
import {clearComponents, getComponents, registerComponent} from './component-registry'

describe('component-processor property tests', () => {
  afterEach(() => { // Clean up after each test
    clearComponents()
  })

  describe('property 7: Circular Dependency Detection', () => {
    const componentNameArb = fc.string({minLength: 1, maxLength: 10, unit: 'grapheme-ascii'}) // Generate valid component names (PascalCase)
      .filter(s => /^[A-Z][a-zA-Z0-9]*$/.test(s))

    function createMockElement(name: string): MdxJsxFlowElement {
      return {
        type: 'mdxJsxFlowElement',
        name,
        attributes: [],
        children: []
      }
    }

    function createMockContext(
      components: Map<string, ComponentHandler>,
      processingStack: string[] = []
    ): ProcessingContext {
      return {
        scope: {},
        components,
        processingStack
      }
    }

    async function mockProcessAst(
      ast: Root,
      ctx: ProcessingContext
    ): Promise<Root> {
      const newChildren: RootContent[] = []

      for (const child of ast.children) {
        if (child.type === 'mdxJsxFlowElement' && child.name != null) {
          const result = await processComponent(child, ctx, mockProcessAst) // Process JSX elements through processComponent (which checks for cycles)
          newChildren.push(...result)
        } else newChildren.push(child)
      }

      return {type: 'root', children: newChildren}
    }

    function createReferencingHandler(targetComponentName: string): ComponentHandler {
      return async (
        _element: MdxJsxFlowElement | MdxJsxTextElement,
        ctx: ProcessingContext,
        processChildren: (children: RootContent[], ctx: ProcessingContext) => Promise<RootContent[]>
      ): Promise<RootContent[]> => {
        const refElement: MdxJsxFlowElement = { // Create a child element that references the target component
          type: 'mdxJsxFlowElement',
          name: targetComponentName,
          attributes: [],
          children: []
        }

        return processChildren([refElement], ctx) // This will go through mockProcessAst -> processComponent, triggering cycle detection // Process the child element through processChildren
      }
    }

    function createTerminalHandler(): ComponentHandler {
      return async (): Promise<RootContent[]> => []
    }

    it('should detect direct self-reference (A -> A)', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          async componentName => {
            registerComponent(componentName, createReferencingHandler(componentName)) // Register a self-referencing component (A -> A)

            const components = getComponents()
            const ctx = createMockContext(components)
            const element = createMockElement(componentName)

            void expect( // Should throw circular dependency error
              processComponent(element, ctx, mockProcessAst)
            ).rejects.toThrow(/[Cc]ircular dependency detected/)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should detect two-component cycle (A -> B -> A)', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          componentNameArb.filter(s => s.length > 0),
          async (nameA, nameB) => {
            const componentA = `${nameA}A` // Ensure different names
            const componentB = `${nameB}B`

            registerComponent(componentA, createReferencingHandler(componentB)) // A references B, B references A
            registerComponent(componentB, createReferencingHandler(componentA))

            const components = getComponents()
            const ctx = createMockContext(components)
            const element = createMockElement(componentA)

            void expect( // Should throw circular dependency error
              processComponent(element, ctx, mockProcessAst)
            ).rejects.toThrow(/[Cc]ircular dependency detected/)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should detect longer cycles (A -> B -> C -> A)', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          componentNameArb,
          componentNameArb,
          async (nameA, nameB, nameC) => {
            const componentA = `${nameA}A` // Ensure different names by appending suffixes
            const componentB = `${nameB}B`
            const componentC = `${nameC}C`

            registerComponent(componentA, createReferencingHandler(componentB)) // A -> B -> C -> A
            registerComponent(componentB, createReferencingHandler(componentC))
            registerComponent(componentC, createReferencingHandler(componentA))

            const components = getComponents()
            const ctx = createMockContext(components)
            const element = createMockElement(componentA)

            void expect( // Should throw circular dependency error
              processComponent(element, ctx, mockProcessAst)
            ).rejects.toThrow(/[Cc]ircular dependency detected/)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should include cycle path in error message', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          async componentName => {
            registerComponent(componentName, createReferencingHandler(componentName)) // Register a self-referencing component

            const components = getComponents()
            const ctx = createMockContext(components)
            const element = createMockElement(componentName)

            try {
              await processComponent(element, ctx, mockProcessAst)
              expect.fail('Should have thrown circular dependency error') // Should not reach here
            }
            catch (error) {
              expect(error).toBeInstanceOf(Error)
              const errorMessage = (error as Error).message
              expect(errorMessage).toContain(componentName) // Error message should contain the component name in the cycle path
            }
          }
        ),
        {numRuns: 100}
      )
    })

    it('should not throw for non-circular component chains', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          componentNameArb,
          async (nameA, nameB) => {
            const componentA = `${nameA}A` // Ensure different names
            const componentB = `${nameB}B`

            registerComponent(componentA, createReferencingHandler(componentB)) // A references B, B is terminal (no further references)
            registerComponent(componentB, createTerminalHandler())

            const components = getComponents()
            const ctx = createMockContext(components)
            const element = createMockElement(componentA)

            const result = await processComponent(element, ctx, mockProcessAst) // Should NOT throw - no circular dependency
            expect(result).toEqual([])
          }
        ),
        {numRuns: 100}
      )
    })

    it('should detect cycle regardless of chain length before cycle', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({min: 1, max: 5}), // Generate chain length (1-5 components before the cycle)
          componentNameArb,
          async (chainLength, baseName) => {
            const componentNames = Array.from(
              {length: chainLength},
              (_, i) => `${baseName}${i}`
            )

            for (let i = 0; i < componentNames.length; i++) { // Register chain where last component references first (creating cycle)
              const nextIndex = (i + 1) % componentNames.length
              registerComponent(componentNames[i], createReferencingHandler(componentNames[nextIndex]))
            }

            const components = getComponents()
            const ctx = createMockContext(components)
            const element = createMockElement(componentNames[0])

            void expect( // Should throw circular dependency error
              processComponent(element, ctx, mockProcessAst)
            ).rejects.toThrow(/[Cc]ircular dependency detected/)
          }
        ),
        {numRuns: 100}
      )
    })
  })
})
