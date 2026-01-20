import type {EvaluationScope} from './types.js' // JavaScript expression evaluation module for MDX // expression-eval.ts
import {UndefinedNamespaceError, UndefinedVariableError} from '@/types/Errors'

/**
 * Options for expression evaluation
 */
export interface EvaluateExpressionOptions {
  /** File path for error messages */
  readonly filePath?: string
}

/**
 * Evaluates a JavaScript expression within a given scope.
 * Uses Function constructor for safe evaluation with controlled scope.
 *
 * @param expression - The JavaScript expression string (without braces)
 * @param scope - Object containing variables available to the expression
 * @param options - Optional configuration including file path for error messages
 * @returns The evaluated result as a string
 * @throws UndefinedVariableError if expression references undefined variables
 * @throws UndefinedNamespaceError if expression references undefined namespace
 * @throws Error if expression fails to evaluate
 */
export function evaluateExpression(
  expression: string,
  scope: EvaluationScope,
  options?: EvaluateExpressionOptions
): string {
  const trimmed = expression.trim()

  if (trimmed === '') return ''

  if (/^[a-z_$][\w$]*(?:\.[a-z_$][\w$]*)*$/i.test(trimmed)) return evaluateSimpleReference(trimmed, scope, options?.filePath) // Matches: identifier, identifier.property, identifier.property.nested // Handle simple variable references directly for better error messages

  return evaluateComplexExpression(trimmed, scope, options?.filePath)
}

/**
 * Evaluates a simple variable reference or property access.
 */
function evaluateSimpleReference(
  reference: string,
  scope: EvaluationScope,
  filePath?: string
): string {
  const parts = reference.split('.')
  const rootVar = parts[0]

  if (rootVar == null || !(rootVar in scope)) {
    throw new UndefinedNamespaceError(rootVar ?? '', reference, filePath) // Root variable is treated as a namespace
  }

  let value: unknown = scope[rootVar]
  for (let i = 1; i < parts.length; i++) {
    const prop = parts[i]
    if (prop == null) continue

    if (value == null) throw new UndefinedVariableError(prop, reference, filePath)
    if (typeof value !== 'object') {
      throw new TypeError(
        `Cannot read property "${prop}" of ${typeof value} in expression "${reference}"`
      )
    }
    const obj = value as Record<string, unknown>
    if (!(prop in obj)) throw new UndefinedVariableError(prop, reference, filePath)
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
  filePath?: string
): string {
  const scopeKeys = Object.keys(scope)
  const scopeValues = scopeKeys.map(k => scope[k])

  try {
    // eslint-disable-next-line ts/no-implied-eval, no-new-func
    const fn = new Function(...scopeKeys, `return (${expression})`) as (
      ...args: unknown[]
    ) => unknown
    const result: unknown = fn(...scopeValues)
    return convertToString(result)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('is not defined')) { // Check if the error is about undefined variable
      const match = /(\w+) is not defined/.exec(message)
      if (match?.[1] != null) throw new UndefinedNamespaceError(match[1], expression, filePath)
    }
    const fileInfo = filePath != null ? ` (file: ${filePath})` : ''
    throw new Error(
      `Failed to evaluate expression: "${expression}"${fileInfo}\nCause: ${message}`
    )
  }
}

/**
 * Converts a value to its string representation.
 */
function convertToString(value: unknown): string {
  if (value == null) return ''

  if (typeof value === 'string') return value

  if (typeof value === 'number' || typeof value === 'boolean') return String(value)

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    }
    catch {
      return String(value)
    }
  }

  return String(value)
}
