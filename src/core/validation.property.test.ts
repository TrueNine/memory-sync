/**
 * Property-based tests for plugin validation
 * **Feature: plugin-architecture, Property 2: Plugin name validation**
 * **Validates: Requirements 22.1**
 */

import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { InputType, ValidationError } from './types'
import { isValidOutputPlugin, isValidPlugin, validateOutputPlugin, validatePlugin } from './validation'

describe('plugin validation properties', () => {
  it('should reject objects without name property', () => {
    /**
     * **Feature: plugin-architecture, Property 2: Plugin name validation**
     * **Validates: Requirements 22.1**
     *
     * For any object without a name property, validation should throw ValidationError
     */
    fc.assert(
      fc.property(
        fc.record({
          priority: fc.option(fc.integer(), { nil: undefined }),
          dependencies: fc.option(fc.array(fc.string()), { nil: undefined }),
        }),
        (obj) => {
          expect(() => validatePlugin(obj)).toThrow(ValidationError)
          expect(isValidPlugin(obj)).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should reject empty or whitespace-only names', () => {
    /**
     * **Feature: plugin-architecture, Property 2: Plugin name validation**
     * **Validates: Requirements 22.1**
     *
     * For any object with empty string or whitespace-only name, validation should throw
     */
    fc.assert(
      fc.property(
        fc.record({
          name: fc.constantFrom('', ' ', '  ', '\t', '\n', '   \t\n  '),
          priority: fc.option(fc.integer(), { nil: undefined }),
        }),
        (obj) => {
          expect(() => validatePlugin(obj)).toThrow(ValidationError)
          expect(() => validatePlugin(obj)).toThrow(/empty|whitespace/)
          expect(isValidPlugin(obj)).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should accept valid plugin objects with non-empty names', () => {
    /**
     * **Feature: plugin-architecture, Property 2: Plugin name validation**
     * **Validates: Requirements 22.1**
     *
     * For any object with a valid non-empty name, validation should pass
     */
    fc.assert(
      fc.property(
        fc.record({
          name: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
          priority: fc.option(fc.integer(), { nil: undefined }),
          dependencies: fc.option(fc.array(fc.string()), { nil: undefined }),
        }),
        (obj) => {
          expect(() => validatePlugin(obj)).not.toThrow()
          expect(isValidPlugin(obj)).toBe(true)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should reject non-string name values', () => {
    /**
     * **Feature: plugin-architecture, Property 2: Plugin name validation**
     * **Validates: Requirements 22.1**
     *
     * For any object with non-string name, validation should throw
     */
    fc.assert(
      fc.property(
        fc.record({
          name: fc.oneof(
            fc.integer(),
            fc.boolean(),
            fc.constant(null),
            fc.array(fc.string()),
            fc.object(),
          ),
        }),
        (obj) => {
          expect(() => validatePlugin(obj)).toThrow(ValidationError)
          expect(isValidPlugin(obj)).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should reject null and undefined plugins', () => {
    /**
     * **Feature: plugin-architecture, Property 2: Plugin name validation**
     * **Validates: Requirements 22.1**
     */
    expect(() => validatePlugin(null)).toThrow(ValidationError)
    expect(() => validatePlugin(undefined)).toThrow(ValidationError)
    expect(isValidPlugin(null)).toBe(false)
    expect(isValidPlugin(undefined)).toBe(false)
  })

  it('should reject non-object plugins', () => {
    /**
     * **Feature: plugin-architecture, Property 2: Plugin name validation**
     * **Validates: Requirements 22.1**
     */
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.integer(), fc.boolean()),
        (value) => {
          expect(() => validatePlugin(value)).toThrow(ValidationError)
          expect(isValidPlugin(value)).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should reject non-number priority values', () => {
    /**
     * **Feature: plugin-architecture, Property 2: Plugin name validation**
     * **Validates: Requirements 9.2**
     *
     * For any plugin with non-number priority, validation should throw
     */
    fc.assert(
      fc.property(
        fc.record({
          name: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
          priority: fc.oneof(
            fc.string(),
            fc.boolean(),
            fc.array(fc.integer()),
            fc.object(),
          ),
        }),
        (obj) => {
          expect(() => validatePlugin(obj)).toThrow(ValidationError)
          expect(() => validatePlugin(obj)).toThrow(/priority/)
          expect(isValidPlugin(obj)).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should accept valid number priority values', () => {
    /**
     * **Feature: plugin-architecture, Property 2: Plugin name validation**
     * **Validates: Requirements 9.2**
     *
     * For any plugin with valid number priority, validation should pass
     */
    fc.assert(
      fc.property(
        fc.record({
          name: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
          priority: fc.integer(),
        }),
        (obj) => {
          expect(() => validatePlugin(obj)).not.toThrow()
          expect(isValidPlugin(obj)).toBe(true)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should reject non-array dependencies', () => {
    /**
     * **Feature: plugin-architecture, Property 2: Plugin name validation**
     * **Validates: Requirements 9.1**
     *
     * For any plugin with non-array dependencies, validation should throw
     */
    fc.assert(
      fc.property(
        fc.record({
          name: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
          dependencies: fc.oneof(
            fc.string(),
            fc.integer(),
            fc.boolean(),
            fc.object(),
          ),
        }),
        (obj) => {
          expect(() => validatePlugin(obj)).toThrow(ValidationError)
          expect(() => validatePlugin(obj)).toThrow(/dependencies/)
          expect(isValidPlugin(obj)).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should reject dependencies with non-string elements', () => {
    /**
     * **Feature: plugin-architecture, Property 2: Plugin name validation**
     * **Validates: Requirements 9.1**
     *
     * For any plugin with dependencies containing non-string elements, validation should throw
     */
    fc.assert(
      fc.property(
        fc.record({
          name: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
          dependencies: fc.array(
            fc.oneof(fc.integer(), fc.boolean(), fc.object()),
            { minLength: 1 },
          ),
        }),
        (obj) => {
          expect(() => validatePlugin(obj)).toThrow(ValidationError)
          expect(() => validatePlugin(obj)).toThrow(/dependency/)
          expect(isValidPlugin(obj)).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should accept valid string array dependencies', () => {
    /**
     * **Feature: plugin-architecture, Property 2: Plugin name validation**
     * **Validates: Requirements 9.1**
     *
     * For any plugin with valid string array dependencies, validation should pass
     */
    fc.assert(
      fc.property(
        fc.record({
          name: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
          dependencies: fc.array(fc.string()),
        }),
        (obj) => {
          expect(() => validatePlugin(obj)).not.toThrow()
          expect(isValidPlugin(obj)).toBe(true)
        },
      ),
      { numRuns: 100 },
    )
  })
})

describe('output plugin validation properties', () => {
  it('should reject non-string extends values', () => {
    /**
     * **Feature: plugin-architecture, Property 2: Plugin name validation**
     * **Validates: Requirements 28.1**
     *
     * For any output plugin with non-string extends, validation should throw
     */
    fc.assert(
      fc.property(
        fc.record({
          name: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
          extends: fc.oneof(
            fc.integer(),
            fc.boolean(),
            fc.array(fc.string()),
            fc.object(),
          ),
        }),
        (obj) => {
          expect(() => validateOutputPlugin(obj)).toThrow(ValidationError)
          expect(() => validateOutputPlugin(obj)).toThrow(/extends/)
          expect(isValidOutputPlugin(obj)).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should accept valid string extends values', () => {
    /**
     * **Feature: plugin-architecture, Property 2: Plugin name validation**
     * **Validates: Requirements 28.1**
     *
     * For any output plugin with valid string extends, validation should pass
     */
    fc.assert(
      fc.property(
        fc.record({
          name: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
          extends: fc.string(),
        }),
        (obj) => {
          expect(() => validateOutputPlugin(obj)).not.toThrow()
          expect(isValidOutputPlugin(obj)).toBe(true)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should reject non-array inputTypes', () => {
    /**
     * **Feature: plugin-architecture, Property 2: Plugin name validation**
     * **Validates: Requirements 29.2**
     *
     * For any output plugin with non-array inputTypes, validation should throw
     */
    fc.assert(
      fc.property(
        fc.record({
          name: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
          inputTypes: fc.oneof(
            fc.string(),
            fc.integer(),
            fc.boolean(),
            fc.object(),
          ),
        }),
        (obj) => {
          expect(() => validateOutputPlugin(obj)).toThrow(ValidationError)
          expect(() => validateOutputPlugin(obj)).toThrow(/inputTypes/)
          expect(isValidOutputPlugin(obj)).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should reject inputTypes with invalid values', () => {
    /**
     * **Feature: plugin-architecture, Property 2: Plugin name validation**
     * **Validates: Requirements 29.2**
     *
     * For any output plugin with inputTypes containing invalid values, validation should throw
     */
    fc.assert(
      fc.property(
        fc.record({
          name: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
          inputTypes: fc.array(
            fc.string().filter((s) => !Object.values(InputType).includes(s as InputType)),
            { minLength: 1 },
          ),
        }),
        (obj) => {
          expect(() => validateOutputPlugin(obj)).toThrow(ValidationError)
          expect(() => validateOutputPlugin(obj)).toThrow(/inputType/)
          expect(isValidOutputPlugin(obj)).toBe(false)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should accept valid InputType array values', () => {
    /**
     * **Feature: plugin-architecture, Property 2: Plugin name validation**
     * **Validates: Requirements 29.2**
     *
     * For any output plugin with valid InputType array, validation should pass
     */
    const validInputTypes = Object.values(InputType)
    fc.assert(
      fc.property(
        fc.record({
          name: fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0),
          inputTypes: fc.array(fc.constantFrom(...validInputTypes)),
        }),
        (obj) => {
          expect(() => validateOutputPlugin(obj)).not.toThrow()
          expect(isValidOutputPlugin(obj)).toBe(true)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('should include field name in validation error', () => {
    /**
     * **Feature: plugin-architecture, Property 2: Plugin name validation**
     * **Validates: Requirements 2.4**
     *
     * For any validation error, the error should include the invalid field name
     */
    const testCases = [
      { obj: {}, expectedField: 'name' },
      { obj: { name: '' }, expectedField: 'name' },
      { obj: { name: 'test', priority: 'invalid' }, expectedField: 'priority' },
      { obj: { name: 'test', dependencies: 'invalid' }, expectedField: 'dependencies' },
      { obj: { name: 'test', extends: 123 }, expectedField: 'extends' },
      { obj: { name: 'test', inputTypes: 'invalid' }, expectedField: 'inputTypes' },
    ]

    for (const { obj, expectedField } of testCases) {
      try {
        validateOutputPlugin(obj)
        expect.fail('Should have thrown ValidationError')
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError)
        expect((error as ValidationError).field).toBe(expectedField)
      }
    }
  })
})
