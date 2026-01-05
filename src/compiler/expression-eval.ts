// expression-eval.ts
// JavaScript expression evaluation module for MDX

import type { EvaluationScope } from './types.js'

/**
 * Evaluates a JavaScript expression within a given scope.
 * Uses Function constructor for safe evaluation with controlled scope.
 *
 * @param expression - The JavaScript expression string (without braces)
 * @param scope - Object containing variables available to the expression
 * @returns The evaluated result as a string
 * @throws Error if expression references undefined variables or fails to evaluate
 */
export function evaluateExpression(
  expression: string,
  scope: EvaluationScope,
): string {
  const trimmed = expression.trim()

  if (trimmed === '') {
    return ''
  }

  // Handle simple variable references directly for better error messages
  // Matches: identifier, identifier.property, identifier.property.nested
  if (/^[a-z_$][\w$]*(?:\.[a-z_$][\w$]*)*$/i.test(trimmed)) {
    return evaluateSimpleReference(trimmed, scope)
  }

  return evaluateComplexExpression(trimmed, scope)
}

/**
 * Evaluates a simple variable reference or property access.
 */
function evaluateSimpleReference(
  reference: string,
  scope: EvaluationScope,
): string {
  const parts = reference.split('.')
  const rootVar = parts[0]

  if (rootVar == null || !(rootVar in scope)) {
    throw new Error(
      `Undefined variable: "${rootVar ?? ''}" in expression "${reference}"`,
    )
  }

  let value: unknown = scope[rootVar]
  for (let i = 1; i < parts.length; i++) {
    const prop = parts[i]
    if (prop == null) {
      continue
    }

    if (value == null) {
      throw new Error(
        `Cannot read property "${prop}" of ${String(value)} in expression "${reference}"`,
      )
    }
    if (typeof value !== 'object') {
      throw new TypeError(
        `Cannot read property "${prop}" of ${typeof value} in expression "${reference}"`,
      )
    }
    const obj = value as Record<string, unknown>
    if (!(prop in obj)) {
      throw new Error(
        `Undefined property: "${prop}" in expression "${reference}"`,
      )
    }
    value = obj[prop]
  }

  return convertToString(value)
}

/**
 * Evaluates a complex JavaScript expression using Function constructor.
 */
function evaluateComplexExpression(
  expression: string,
  scope: EvaluationScope,
): string {
  const scopeKeys = Object.keys(scope)
  const scopeValues = scopeKeys.map((k) => scope[k])

  try {
    // eslint-disable-next-line ts/no-implied-eval, no-new-func
    const fn = new Function(...scopeKeys, `return (${expression})`) as (
      ...args: unknown[]
    ) => unknown
    const result: unknown = fn(...scopeValues)
    return convertToString(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Failed to evaluate expression: "${expression}"\nCause: ${message}`,
    )
  }
}

/**
 * Converts a value to its string representation.
 */
function convertToString(value: unknown): string {
  if (value == null) {
    return ''
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  return String(value)
}
