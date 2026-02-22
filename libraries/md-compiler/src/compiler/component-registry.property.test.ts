/**
 * Feature: md-compiler-extraction, Property 3: Component registry round-trip
 *
 * For any component name (non-empty string) and any component handler function,
 * registering the handler via `registerComponent` then checking via `hasComponent`
 * SHALL return `true`, and `getComponents` SHALL contain that handler. After
 * `clearComponents`, `hasComponent` SHALL return `false`.
 *
 * **Validates: Requirements 3.3**
 */

import type {RootContent} from 'mdast'
import type {MdxJsxFlowElement, MdxJsxTextElement} from 'mdast-util-mdx'
import type {ComponentHandler, ProcessingContext} from './types'
import * as fc from 'fast-check'
import {afterEach, describe, expect, it} from 'vitest'
import {
  clearComponents,
  getComponents,
  hasComponent,
  registerComponent
} from './component-registry'

describe('component-registry property tests', () => {
  afterEach(() => clearComponents())

  describe('property 3: Component registry round-trip', () => {
    const componentNameArb = fc.stringMatching(/^[A-Z][a-zA-Z0-9]{0,14}$/)

    const uniqueComponentNamesArb = fc.array(componentNameArb, {minLength: 1, maxLength: 10})
      .map(names => [...new Set(names)])
      .filter(names => names.length > 0)

    /** Create a mock ComponentHandler that returns an identifiable empty array. */
    function createMockHandler(): ComponentHandler {
      return async (
        _element: MdxJsxFlowElement | MdxJsxTextElement,
        _ctx: ProcessingContext,
        _processChildren: (children: RootContent[], ctx: ProcessingContext) => Promise<RootContent[]>
      ): Promise<RootContent[]> => []
    }

    it('should report hasComponent as true after registerComponent for any valid name', () => {
      fc.assert(
        fc.property(
          componentNameArb,
          name => {
            clearComponents()
            const handler = createMockHandler()

            registerComponent(name, handler)

            expect(hasComponent(name)).toBe(true)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should include the registered handler in getComponents after registerComponent', () => {
      fc.assert(
        fc.property(
          componentNameArb,
          name => {
            clearComponents()
            const handler = createMockHandler()

            registerComponent(name, handler)

            const components = getComponents()
            expect(components.has(name)).toBe(true)
            expect(components.get(name)).toBe(handler)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should report hasComponent as false after clearComponents for any registered name', () => {
      fc.assert(
        fc.property(
          componentNameArb,
          name => {
            clearComponents()
            const handler = createMockHandler()

            registerComponent(name, handler)
            expect(hasComponent(name)).toBe(true)

            clearComponents()

            expect(hasComponent(name)).toBe(false)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should complete the full register → has → get → clear cycle for any component', () => {
      fc.assert(
        fc.property(
          componentNameArb,
          name => {
            clearComponents()
            const handler = createMockHandler()

            registerComponent(name, handler) // Register

            expect(hasComponent(name)).toBe(true) // Has → true

            const components = getComponents() // Get → contains handler
            expect(components.has(name)).toBe(true)
            expect(components.get(name)).toBe(handler)

            clearComponents() // Clear

            expect(hasComponent(name)).toBe(false) // Has → false

            const afterClear = getComponents() // Get → empty
            expect(afterClear.has(name)).toBe(false)
            expect(afterClear.size).toBe(0)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should complete the round-trip for multiple components registered at once', () => {
      fc.assert(
        fc.property(
          uniqueComponentNamesArb,
          names => {
            clearComponents()
            const handlers = new Map<string, ComponentHandler>()

            for (const name of names) { // Register all components
              const handler = createMockHandler()
              handlers.set(name, handler)
              registerComponent(name, handler)
            }

            for (const name of names) { // Verify all are present via hasComponent
              expect(hasComponent(name)).toBe(true)
            }

            const components = getComponents() // Verify all are present via getComponents with correct handlers
            expect(components.size).toBe(names.length)
            for (const name of names) {
              expect(components.has(name)).toBe(true)
              expect(components.get(name)).toBe(handlers.get(name))
            }

            clearComponents() // Clear all

            for (const name of names) { // Verify all are gone
              expect(hasComponent(name)).toBe(false)
            }
            expect(getComponents().size).toBe(0)
          }
        ),
        {numRuns: 100}
      )
    })
  })
})
