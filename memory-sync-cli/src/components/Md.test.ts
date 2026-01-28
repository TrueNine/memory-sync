/**
 * Unit tests for the Md component handler.
 *
 * Tests the conditional Markdown wrapping functionality
 * as specified in Requirements 3.1, 3.2, 3.3, 3.4.
 */

import type {Paragraph, RootContent, Text} from 'mdast'
import type {MdxJsxFlowElement} from 'mdast-util-mdx'
import type {ProcessingContext} from '../compiler/types'
import {describe, expect, it} from 'vitest'
import {MdHandler} from './Md'

describe('md component', () => {
  function createMockContext(scope: Record<string, unknown> = {}): ProcessingContext {
    return {
      scope,
      components: new Map(),
      processingStack: []
    }
  }

  function createMockProcessChildren(): (children: RootContent[], ctx: ProcessingContext) => Promise<RootContent[]> {
    return async (children: RootContent[]): Promise<RootContent[]> => children
  }

  function createMdElement(
    children: RootContent[] = [],
    attributes: MdxJsxFlowElement['attributes'] = []
  ): MdxJsxFlowElement {
    return {
      type: 'mdxJsxFlowElement',
      name: 'Md',
      attributes,
      children
    }
  }

  function createParagraph(text: string): Paragraph {
    return {
      type: 'paragraph',
      children: [{type: 'text', value: text} as Text]
    }
  }

  describe('content passthrough (Requirement 3.2)', () => {
    it('should pass through children content directly', async () => {
      const children = [createParagraph('Hello World')]
      const element = createMdElement(children)
      const ctx = createMockContext()
      const processChildren = createMockProcessChildren()

      const result = await MdHandler(element, ctx, processChildren)

      expect(result).toEqual(children)
    })

    it('should pass through multiple children', async () => {
      const children = [
        createParagraph('First paragraph'),
        createParagraph('Second paragraph')
      ]
      const element = createMdElement(children)
      const ctx = createMockContext()
      const processChildren = createMockProcessChildren()

      const result = await MdHandler(element, ctx, processChildren)

      expect(result).toEqual(children)
    })
  })

  describe('empty children (Requirement 3.4)', () => {
    it('should return empty array when no children', async () => {
      const element = createMdElement([])
      const ctx = createMockContext()
      const processChildren = createMockProcessChildren()

      const result = await MdHandler(element, ctx, processChildren)

      expect(result).toEqual([])
    })
  })

  describe('conditional inclusion with when attribute (Requirement 3.3)', () => {
    it('should include content when when="true"', async () => {
      const children = [createParagraph('Conditional content')]
      const element = createMdElement(children, [{type: 'mdxJsxAttribute', name: 'when', value: 'true'}])
      const ctx = createMockContext()
      const processChildren = createMockProcessChildren()

      const result = await MdHandler(element, ctx, processChildren)

      expect(result).toEqual(children)
    })

    it('should exclude content when when="false"', async () => {
      const children = [createParagraph('Conditional content')]
      const element = createMdElement(children, [{type: 'mdxJsxAttribute', name: 'when', value: 'false'}])
      const ctx = createMockContext()
      const processChildren = createMockProcessChildren()

      const result = await MdHandler(element, ctx, processChildren)

      expect(result).toEqual([])
    })

    it('should evaluate expression condition when true', async () => {
      const children = [createParagraph('Conditional content')]
      const element = createMdElement(children, [{type: 'mdxJsxAttribute', name: 'when', value: {type: 'mdxJsxAttributeValueExpression', value: 'showContent'}}])
      const ctx = createMockContext({showContent: true})
      const processChildren = createMockProcessChildren()

      const result = await MdHandler(element, ctx, processChildren)

      expect(result).toEqual(children)
    })

    it('should evaluate expression condition when false', async () => {
      const children = [createParagraph('Conditional content')]
      const element = createMdElement(children, [{type: 'mdxJsxAttribute', name: 'when', value: {type: 'mdxJsxAttributeValueExpression', value: 'showContent'}}])
      const ctx = createMockContext({showContent: false})
      const processChildren = createMockProcessChildren()

      const result = await MdHandler(element, ctx, processChildren)

      expect(result).toEqual([])
    })

    it('should treat undefined expression as false', async () => {
      const children = [createParagraph('Conditional content')]
      const element = createMdElement(children, [{type: 'mdxJsxAttribute', name: 'when', value: {type: 'mdxJsxAttributeValueExpression', value: 'undefinedVar'}}])
      const ctx = createMockContext({})
      const processChildren = createMockProcessChildren()

      const result = await MdHandler(element, ctx, processChildren)

      expect(result).toEqual([])
    })

    it('should handle numeric 1 as truthy', async () => {
      const children = [createParagraph('Conditional content')]
      const element = createMdElement(children, [{type: 'mdxJsxAttribute', name: 'when', value: {type: 'mdxJsxAttributeValueExpression', value: 'flag'}}])
      const ctx = createMockContext({flag: 1})
      const processChildren = createMockProcessChildren()

      const result = await MdHandler(element, ctx, processChildren)

      expect(result).toEqual(children)
    })

    it('should handle numeric 0 as falsy', async () => {
      const children = [createParagraph('Conditional content')]
      const element = createMdElement(children, [{type: 'mdxJsxAttribute', name: 'when', value: {type: 'mdxJsxAttributeValueExpression', value: 'flag'}}])
      const ctx = createMockContext({flag: 0})
      const processChildren = createMockProcessChildren()

      const result = await MdHandler(element, ctx, processChildren)

      expect(result).toEqual([])
    })
  })
})
