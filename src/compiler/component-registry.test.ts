/**
 * Unit tests for the component registry system.
 *
 * Tests the built-in component registration and retrieval functionality
 * as specified in Requirements 2.1.
 */

import type { RootContent } from 'mdast'
import type { MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx'
import type { ComponentHandler, ProcessingContext } from './types'
import { afterEach, describe, expect, it } from 'vitest'
import {
  clearComponents,
  getComponents,
  hasComponent,
  registerComponent,
} from './component-registry'

describe('component-registry', () => {
  // Clean up after each test
  afterEach(() => {
    clearComponents()
  })

  /**
   * Creates a mock component handler for testing
   */
  function createMockHandler(): ComponentHandler {
    return async (
      _element: MdxJsxFlowElement | MdxJsxTextElement,
      _ctx: ProcessingContext,
      _processChildren: (children: RootContent[], ctx: ProcessingContext) => Promise<RootContent[]>,
    ): Promise<RootContent[]> => {
      return []
    }
  }

  describe('registerComponent', () => {
    it('should register a component with a given name', () => {
      const handler = createMockHandler()
      registerComponent('TestComponent', handler)

      expect(hasComponent('TestComponent')).toBe(true)
    })

    it('should allow registering multiple components', () => {
      const handler1 = createMockHandler()
      const handler2 = createMockHandler()

      registerComponent('Component1', handler1)
      registerComponent('Component2', handler2)

      expect(hasComponent('Component1')).toBe(true)
      expect(hasComponent('Component2')).toBe(true)
    })

    it('should overwrite existing component with same name', () => {
      const handler1 = createMockHandler()
      const handler2 = createMockHandler()

      registerComponent('TestComponent', handler1)
      registerComponent('TestComponent', handler2)

      const components = getComponents()
      expect(components.get('TestComponent')).toBe(handler2)
    })
  })

  describe('getComponents', () => {
    it('should return empty map when no components registered', () => {
      const components = getComponents()
      expect(components.size).toBe(0)
    })

    it('should return a copy of the registry', () => {
      const handler = createMockHandler()
      registerComponent('TestComponent', handler)

      const components1 = getComponents()
      const components2 = getComponents()

      // Should be different Map instances
      expect(components1).not.toBe(components2)
      // But with same content
      expect(components1.size).toBe(components2.size)
    })

    it('should not allow external mutation of registry', () => {
      const handler = createMockHandler()
      registerComponent('TestComponent', handler)

      const components = getComponents()
      components.delete('TestComponent')

      // Original registry should be unchanged
      expect(hasComponent('TestComponent')).toBe(true)
    })
  })

  describe('hasComponent', () => {
    it('should return false for unregistered component', () => {
      expect(hasComponent('NonExistent')).toBe(false)
    })

    it('should return true for registered component', () => {
      const handler = createMockHandler()
      registerComponent('TestComponent', handler)

      expect(hasComponent('TestComponent')).toBe(true)
    })

    it('should be case-sensitive', () => {
      const handler = createMockHandler()
      registerComponent('TestComponent', handler)

      expect(hasComponent('testcomponent')).toBe(false)
      expect(hasComponent('TESTCOMPONENT')).toBe(false)
    })
  })

  describe('clearComponents', () => {
    it('should remove all registered components', () => {
      const handler = createMockHandler()
      registerComponent('Component1', handler)
      registerComponent('Component2', handler)

      clearComponents()

      expect(hasComponent('Component1')).toBe(false)
      expect(hasComponent('Component2')).toBe(false)
      expect(getComponents().size).toBe(0)
    })
  })
})
