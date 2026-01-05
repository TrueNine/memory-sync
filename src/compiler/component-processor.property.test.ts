/**
 * Feature: mdx-compiler-simplification
 * Property 7: Circular Dependency Detection
 *
 * For any component reference chain that forms a cycle, the compiler SHALL detect
 * the circular dependency and throw a descriptive error before infinite recursion occurs.
 *
 * Validates: Requirements 5.4
 */

import type { Root, RootContent } from 'mdast'
import type { MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx'
import type { ComponentHandler, ProcessingContext } from './types'
import * as fc from 'fast-check'
import { afterEach, describe, expect, it } from 'vitest'
import { processComponent } from './component-processor'
import { clearComponents, getComponents, registerComponent } from './component-registry'

describe('component-processor property tests', () => {
  // Clean up after each test
  afterEach(() => {
    clearComponents()
  })

  /**
   * Feature: mdx-compiler-simplification, Property 7: Circular Dependency Detection
   *
   * For any component reference chain that forms a cycle, the compiler SHALL detect
   * the circular dependency and throw a descriptive error before infinite recursion occurs.
   *
   * Validates: Requirements 5.4
   */
  describe('property 7: Circular Dependency Detection', () => {
    // Generate valid component names (PascalCase)
    const componentNameArb = fc.string({ minLength: 1, maxLength: 10, unit: 'grapheme-ascii' })
      .filter((s) => /^[A-Z][a-zA-Z0-9]*$/.test(s))

    /**
     * Creates a mock JSX element for testing
     */
    function createMockElement(name: string): MdxJsxFlowElement {
      return {
        type: 'mdxJsxFlowElement',
        name,
        attributes: [],
        children: [],
      }
    }

    /**
     * Creates a mock processing context
     */
    function createMockContext(
      components: Map<string, ComponentHandler>,
      processingStack: string[] = [],
    ): ProcessingContext {
      return {
        scope: {},
        components,
        processingStack,
      }
    }

    /**
     * Mock processAst function that processes JSX elements through processComponent
     * This simulates the real transformer behavior
     */
    async function mockProcessAst(
      ast: Root,
      ctx: ProcessingContext,
    ): Promise<Root> {
      const newChildren: RootContent[] = []

      for (const child of ast.children) {
        if (child.type === 'mdxJsxFlowElement' && child.name != null) {
          // Process JSX elements through processComponent (which checks for cycles)
          const result = await processComponent(child, ctx, mockProcessAst)
          newChildren.push(...result)
        } else {
          newChildren.push(child)
        }
      }

      return { type: 'root', children: newChildren }
    }

    /**
     * Creates a component handler that embeds a child JSX element referencing another component.
     * The child element will be processed through processChildren -> mockProcessAst -> processComponent,
     * which is where circular dependency detection happens.
     */
    function createReferencingHandler(targetComponentName: string): ComponentHandler {
      return async (
        _element: MdxJsxFlowElement | MdxJsxTextElement,
        ctx: ProcessingContext,
        processChildren: (children: RootContent[], ctx: ProcessingContext) => Promise<RootContent[]>,
      ): Promise<RootContent[]> => {
        // Create a child element that references the target component
        const refElement: MdxJsxFlowElement = {
          type: 'mdxJsxFlowElement',
          name: targetComponentName,
          attributes: [],
          children: [],
        }

        // Process the child element through processChildren
        // This will go through mockProcessAst -> processComponent, triggering cycle detection
        return processChildren([refElement], ctx)
      }
    }

    /**
     * Creates a terminal component handler that doesn't reference other components
     */
    function createTerminalHandler(): ComponentHandler {
      return async (): Promise<RootContent[]> => {
        return []
      }
    }

    it('should detect direct self-reference (A -> A)', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          async (componentName) => {
            // Register a self-referencing component (A -> A)
            registerComponent(componentName, createReferencingHandler(componentName))

            const components = getComponents()
            const ctx = createMockContext(components)
            const element = createMockElement(componentName)

            // Should throw circular dependency error
            await expect(
              processComponent(element, ctx, mockProcessAst),
            ).rejects.toThrow(/[Cc]ircular dependency detected/)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should detect two-component cycle (A -> B -> A)', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          componentNameArb.filter((s) => s.length > 0),
          async (nameA, nameB) => {
            // Ensure different names
            const componentA = `${nameA}A`
            const componentB = `${nameB}B`

            // A references B, B references A
            registerComponent(componentA, createReferencingHandler(componentB))
            registerComponent(componentB, createReferencingHandler(componentA))

            const components = getComponents()
            const ctx = createMockContext(components)
            const element = createMockElement(componentA)

            // Should throw circular dependency error
            await expect(
              processComponent(element, ctx, mockProcessAst),
            ).rejects.toThrow(/[Cc]ircular dependency detected/)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should detect longer cycles (A -> B -> C -> A)', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          componentNameArb,
          componentNameArb,
          async (nameA, nameB, nameC) => {
            // Ensure different names by appending suffixes
            const componentA = `${nameA}A`
            const componentB = `${nameB}B`
            const componentC = `${nameC}C`

            // A -> B -> C -> A
            registerComponent(componentA, createReferencingHandler(componentB))
            registerComponent(componentB, createReferencingHandler(componentC))
            registerComponent(componentC, createReferencingHandler(componentA))

            const components = getComponents()
            const ctx = createMockContext(components)
            const element = createMockElement(componentA)

            // Should throw circular dependency error
            await expect(
              processComponent(element, ctx, mockProcessAst),
            ).rejects.toThrow(/[Cc]ircular dependency detected/)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should include cycle path in error message', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          async (componentName) => {
            // Register a self-referencing component
            registerComponent(componentName, createReferencingHandler(componentName))

            const components = getComponents()
            const ctx = createMockContext(components)
            const element = createMockElement(componentName)

            try {
              await processComponent(element, ctx, mockProcessAst)
              // Should not reach here
              expect.fail('Should have thrown circular dependency error')
            } catch (error) {
              expect(error).toBeInstanceOf(Error)
              const errorMessage = (error as Error).message
              // Error message should contain the component name in the cycle path
              expect(errorMessage).toContain(componentName)
            }
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should not throw for non-circular component chains', async () => {
      await fc.assert(
        fc.asyncProperty(
          componentNameArb,
          componentNameArb,
          async (nameA, nameB) => {
            // Ensure different names
            const componentA = `${nameA}A`
            const componentB = `${nameB}B`

            // A references B, B is terminal (no further references)
            registerComponent(componentA, createReferencingHandler(componentB))
            registerComponent(componentB, createTerminalHandler())

            const components = getComponents()
            const ctx = createMockContext(components)
            const element = createMockElement(componentA)

            // Should NOT throw - no circular dependency
            const result = await processComponent(element, ctx, mockProcessAst)
            expect(result).toEqual([])
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should detect cycle regardless of chain length before cycle', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate chain length (1-5 components before the cycle)
          fc.integer({ min: 1, max: 5 }),
          componentNameArb,
          async (chainLength, baseName) => {
            // Create a chain: A0 -> A1 -> ... -> An-1 -> A0 (cycle back to start)
            const componentNames = Array.from(
              { length: chainLength },
              (_, i) => `${baseName}${i}`,
            )

            // Register chain where last component references first (creating cycle)
            for (let i = 0; i < componentNames.length; i++) {
              const nextIndex = (i + 1) % componentNames.length
              registerComponent(
                componentNames[i],
                createReferencingHandler(componentNames[nextIndex]),
              )
            }

            const components = getComponents()
            const ctx = createMockContext(components)
            const element = createMockElement(componentNames[0])

            // Should throw circular dependency error
            await expect(
              processComponent(element, ctx, mockProcessAst),
            ).rejects.toThrow(/[Cc]ircular dependency detected/)
          },
        ),
        { numRuns: 100 },
      )
    })
  })
})
