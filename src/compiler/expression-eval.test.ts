/**
 * Unit tests for the expression evaluator.
 *
 * Tests the JavaScript expression evaluation functionality
 * as specified in Requirements 6.1, 6.2, 6.3.
 */

import {describe, expect, it} from 'vitest'
import {UndefinedNamespaceError, UndefinedVariableError} from '@/types/Errors'
import {evaluateExpression} from './expression-eval'

describe('expression-eval', () => {
  describe('simple variable references (Requirement 6.1)', () => {
    it('should evaluate simple variable', () => {
      const result = evaluateExpression('name', {name: 'World'})
      expect(result).toBe('World')
    })

    it('should evaluate numeric variable', () => {
      const result = evaluateExpression('count', {count: 42})
      expect(result).toBe('42')
    })

    it('should evaluate boolean variable', () => {
      const result = evaluateExpression('flag', {flag: true})
      expect(result).toBe('true')
    })

    it('should return empty string for null', () => {
      const result = evaluateExpression('value', {value: null})
      expect(result).toBe('')
    })

    it('should return empty string for undefined', () => {
      const result = evaluateExpression('value', {value: void 0})
      expect(result).toBe('')
    })
  })

  describe('property access (Requirement 6.1)', () => {
    it('should evaluate nested property access', () => {
      const result = evaluateExpression('user.name', {user: {name: 'John'}})
      expect(result).toBe('John')
    })

    it('should evaluate deeply nested property access', () => {
      const result = evaluateExpression('a.b.c', {a: {b: {c: 'deep'}}})
      expect(result).toBe('deep')
    })

    it('should throw for undefined root variable', () => {
      expect(() => evaluateExpression('unknown', {})).toThrow(/Undefined namespace/)
    })

    it('should throw for undefined nested property', () => {
      expect(() => evaluateExpression('user.unknown', {user: {}})).toThrow(/Undefined variable/)
    })
  })

  describe('complex expressions (Requirement 6.3)', () => {
    it('should evaluate arithmetic expressions', () => {
      const result = evaluateExpression('a + b', {a: 1, b: 2})
      expect(result).toBe('3')
    })

    it('should evaluate string concatenation', () => {
      const result = evaluateExpression('first + " " + last', {first: 'Hello', last: 'World'})
      expect(result).toBe('Hello World')
    })

    it('should evaluate ternary expressions', () => {
      const result = evaluateExpression('flag ? "yes" : "no"', {flag: true})
      expect(result).toBe('yes')
    })

    it('should evaluate comparison expressions', () => {
      const result = evaluateExpression('a > b', {a: 5, b: 3})
      expect(result).toBe('true')
    })

    it('should evaluate logical expressions', () => {
      const result = evaluateExpression('a && b', {a: true, b: false})
      expect(result).toBe('false')
    })

    it('should evaluate array access', () => {
      const result = evaluateExpression('items[0]', {items: ['first', 'second']})
      expect(result).toBe('first')
    })

    it('should evaluate method calls', () => {
      const result = evaluateExpression('text.toUpperCase()', {text: 'hello'})
      expect(result).toBe('HELLO')
    })
  })

  describe('jSX attribute expressions (Requirement 6.2)', () => {
    it('should evaluate expressions used in JSX attributes', () => {
      // Simulating what would be in an attribute like if={condition}
      const result = evaluateExpression('condition', {condition: true})
      expect(result).toBe('true')
    })

    it('should evaluate complex attribute expressions', () => {
      // Simulating what would be in an attribute like value={items.length > 0}
      const result = evaluateExpression('items.length > 0', {items: [1, 2, 3]})
      expect(result).toBe('true')
    })
  })

  describe('edge cases', () => {
    it('should handle empty expression', () => {
      const result = evaluateExpression('', {})
      expect(result).toBe('')
    })

    it('should handle whitespace-only expression', () => {
      const result = evaluateExpression('   ', {})
      expect(result).toBe('')
    })

    it('should handle object serialization', () => {
      const result = evaluateExpression('obj', {obj: {a: 1, b: 2}})
      expect(result).toBe('{"a":1,"b":2}')
    })

    it('should handle array serialization', () => {
      const result = evaluateExpression('arr', {arr: [1, 2, 3]})
      expect(result).toBe('[1,2,3]')
    })

    it('should throw for invalid expression syntax', () => {
      expect(() => evaluateExpression('a +', {a: 1})).toThrow()
    })
  })

  describe('error handling with new error types (Requirements 7.1, 7.2)', () => {
    it('should throw UndefinedNamespaceError for undefined root variable', () => {
      expect(() => evaluateExpression('unknown', {})).toThrow(UndefinedNamespaceError)
    })

    it('should throw UndefinedVariableError for undefined nested property', () => {
      expect(() => evaluateExpression('user.unknown', {user: {}})).toThrow(UndefinedVariableError)
    })

    it('should include variable name in UndefinedVariableError', () => {
      try {
        evaluateExpression('user.missing', {user: {}})
      } catch (error) {
        expect(error).toBeInstanceOf(UndefinedVariableError)
        expect((error as UndefinedVariableError).variableName).toBe('missing')
        expect((error as UndefinedVariableError).expression).toBe('user.missing')
      }
    })

    it('should include namespace in UndefinedNamespaceError', () => {
      try {
        evaluateExpression('unknown', {})
      } catch (error) {
        expect(error).toBeInstanceOf(UndefinedNamespaceError)
        expect((error as UndefinedNamespaceError).namespace).toBe('unknown')
        expect((error as UndefinedNamespaceError).expression).toBe('unknown')
      }
    })

    it('should include file path in error when provided', () => {
      try {
        evaluateExpression('unknown', {}, {filePath: '/path/to/file.mdx'})
      } catch (error) {
        expect(error).toBeInstanceOf(UndefinedNamespaceError)
        expect((error as UndefinedNamespaceError).filePath).toBe('/path/to/file.mdx')
        expect(error.message).toContain('/path/to/file.mdx')
      }
    })

    it('should include file path in UndefinedVariableError when provided', () => {
      try {
        evaluateExpression('user.missing', {user: {}}, {filePath: '/path/to/file.mdx'})
      } catch (error) {
        expect(error).toBeInstanceOf(UndefinedVariableError)
        expect((error as UndefinedVariableError).filePath).toBe('/path/to/file.mdx')
        expect(error.message).toContain('/path/to/file.mdx')
      }
    })
  })
})
