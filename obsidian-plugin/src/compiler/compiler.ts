import type {
  ArrayExpression,
  BinaryExpression,
  ConditionalExpression,
  Expression,
  Identifier,
  LogicalExpression,
  MemberExpression,
  ObjectExpression,
  Pattern,
  Program,
  TemplateLiteral,
  UnaryExpression,
} from 'estree'
import type {Root} from 'mdast'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMdx from 'remark-mdx'
import remarkParse from 'remark-parse'
import remarkStringify from 'remark-stringify'
import {unified} from 'unified'
import {parse as parseYaml} from 'yaml'

import type {CompileDiagnostic, CompileResult} from './types'

interface AstNode {
  type: string
  value?: string
  name?: string | null
  children?: AstNode[]
  attributes?: MdxAttribute[]
  data?: {
    estree?: Program
  }
}

interface MdxAttribute {
  type: string
  name?: string
  value?: string | MdxExpressionValue | null
}

interface MdxExpressionValue {
  type: string
  value: string
  data?: {
    estree?: Program
  }
}

type EvaluationResult =
  | {ok: true, value: unknown}
  | {ok: false, reason: string}

const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkFrontmatter, ['yaml'])
  .use(remarkMdx)
  .use(remarkStringify, {
    bullet: '-',
    fences: true,
  })

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value)
}

function isExpression(value: Expression | Pattern): value is Expression {
  return !['ArrayPattern', 'AssignmentPattern', 'ObjectPattern', 'RestElement'].includes(value.type)
}

function cloneSafe(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(cloneSafe)
  }
  if (!isRecord(value)) {
    return value
  }

  const output: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (!BLOCKED_KEYS.has(key)) {
      output[key] = cloneSafe(child)
    }
  }
  return output
}

function mergeRecords(...layers: readonly Record<string, unknown>[]): Record<string, unknown> {
  const output: Record<string, unknown> = {}

  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer)) {
      if (BLOCKED_KEYS.has(key)) continue
      const current = output[key]
      output[key] = isRecord(current) && isRecord(value)
        ? mergeRecords(current, value)
        : cloneSafe(value)
    }
  }

  return output
}

export function mergeScopeLayers(...layers: readonly Record<string, unknown>[]): Record<string, unknown> {
  return mergeRecords(...layers)
}

function expressionFromProgram(program: Program | undefined): Expression | undefined {
  if (program?.body.length !== 1) return undefined
  const statement = program.body[0]
  return statement?.type === 'ExpressionStatement' ? statement.expression : undefined
}

function propertyName(node: Identifier | Expression, computed: boolean): EvaluationResult {
  if (!computed && node.type === 'Identifier') {
    return {ok: true, value: node.name}
  }
  const evaluated = evaluateExpression(node, {})
  if (!evaluated.ok || (typeof evaluated.value !== 'string' && typeof evaluated.value !== 'number')) {
    return {ok: false, reason: 'Property names must be static strings or numbers.'}
  }
  return evaluated
}

function evaluateArray(node: ArrayExpression, scope: Record<string, unknown>): EvaluationResult {
  const values: unknown[] = []
  for (const element of node.elements) {
    if (element == null || element.type === 'SpreadElement') {
      return {ok: false, reason: 'Array holes and spread elements are not supported.'}
    }
    const result = evaluateExpression(element, scope)
    if (!result.ok) return result
    values.push(result.value)
  }
  return {ok: true, value: values}
}

function evaluateObject(node: ObjectExpression, scope: Record<string, unknown>): EvaluationResult {
  const output: Record<string, unknown> = {}
  for (const entry of node.properties) {
    if (entry.type !== 'Property' || entry.kind !== 'init' || entry.method || !isExpression(entry.value)) {
      return {ok: false, reason: 'Only static object properties are supported.'}
    }
    const keyResult = propertyName(entry.key, entry.computed)
    if (!keyResult.ok) return keyResult
    const key = String(keyResult.value)
    if (BLOCKED_KEYS.has(key)) {
      return {ok: false, reason: `Blocked property name: ${key}`}
    }
    const valueResult = evaluateExpression(entry.value, scope)
    if (!valueResult.ok) return valueResult
    output[key] = valueResult.value
  }
  return {ok: true, value: output}
}

function evaluateMember(node: MemberExpression, scope: Record<string, unknown>): EvaluationResult {
  if (node.object.type === 'Super') {
    return {ok: false, reason: 'Super references are not supported.'}
  }
  const objectResult = evaluateExpression(node.object, scope)
  if (!objectResult.ok || objectResult.value == null) {
    return {ok: false, reason: objectResult.ok ? 'Cannot read a nullish value.' : objectResult.reason}
  }
  if (node.property.type === 'PrivateIdentifier') {
    return {ok: false, reason: 'Private properties are not supported.'}
  }
  const keyResult = propertyName(node.property, node.computed)
  if (!keyResult.ok) return keyResult
  const key = String(keyResult.value)
  if (BLOCKED_KEYS.has(key) || (!isRecord(objectResult.value) && !isUnknownArray(objectResult.value))) {
    return {ok: false, reason: `Unsafe or unavailable property: ${key}`}
  }
  if (!Object.hasOwn(objectResult.value, key)) {
    return {ok: false, reason: `Unknown property: ${key}`}
  }
  const value: unknown = isUnknownArray(objectResult.value)
    ? objectResult.value[Number(key)]
    : objectResult.value[key]
  return {ok: true, value}
}

function evaluateUnary(node: UnaryExpression, scope: Record<string, unknown>): EvaluationResult {
  const argument = evaluateExpression(node.argument, scope)
  if (!argument.ok) return argument
  switch (node.operator) {
    case '!': return {ok: true, value: !argument.value}
    case '+': return {ok: true, value: Number(argument.value)}
    case '-': return {ok: true, value: -Number(argument.value)}
    case 'typeof': return {ok: true, value: typeof argument.value}
    case 'void': return {ok: true, value: undefined}
    default: return {ok: false, reason: `Unsupported unary operator: ${node.operator}`}
  }
}

function evaluateBinary(node: BinaryExpression, scope: Record<string, unknown>): EvaluationResult {
  const left = evaluateExpression(node.left as Expression, scope)
  if (!left.ok) return left
  const right = evaluateExpression(node.right, scope)
  if (!right.ok) return right

  switch (node.operator) {
    case '===': return {ok: true, value: left.value === right.value}
    case '!==': return {ok: true, value: left.value !== right.value}
    case '==': return {ok: true, value: left.value === right.value}
    case '!=': return {ok: true, value: left.value !== right.value}
    case '<': return {ok: true, value: String(left.value) < String(right.value)}
    case '<=': return {ok: true, value: String(left.value) <= String(right.value)}
    case '>': return {ok: true, value: String(left.value) > String(right.value)}
    case '>=': return {ok: true, value: String(left.value) >= String(right.value)}
    default: return {ok: false, reason: `Unsupported binary operator: ${node.operator}`}
  }
}

function evaluateLogical(node: LogicalExpression, scope: Record<string, unknown>): EvaluationResult {
  const left = evaluateExpression(node.left, scope)
  if (!left.ok) return left
  if (node.operator === '&&' && !left.value) return left
  if (node.operator === '||' && left.value) return left
  if (node.operator === '??' && left.value != null) return left
  return evaluateExpression(node.right, scope)
}

function evaluateConditional(node: ConditionalExpression, scope: Record<string, unknown>): EvaluationResult {
  const test = evaluateExpression(node.test, scope)
  if (!test.ok) return test
  return evaluateExpression(test.value ? node.consequent : node.alternate, scope)
}

function evaluateTemplate(node: TemplateLiteral, scope: Record<string, unknown>): EvaluationResult {
  let output = node.quasis[0]?.value.cooked ?? ''
  for (let index = 0; index < node.expressions.length; index += 1) {
    const result = evaluateExpression(node.expressions[index] as Expression, scope)
    if (!result.ok) return result
    output += formatValue(result.value)
    output += node.quasis[index + 1]?.value.cooked ?? ''
  }
  return {ok: true, value: output}
}

function evaluateExpression(node: Expression, scope: Record<string, unknown>): EvaluationResult {
  switch (node.type) {
    case 'Literal':
      return node.value instanceof RegExp
        ? {ok: false, reason: 'Regular expressions are not supported.'}
        : {ok: true, value: node.value}
    case 'Identifier':
      return Object.hasOwn(scope, node.name) && !BLOCKED_KEYS.has(node.name)
        ? {ok: true, value: scope[node.name]}
        : {ok: false, reason: `Unknown identifier: ${node.name}`}
    case 'ArrayExpression': return evaluateArray(node, scope)
    case 'ObjectExpression': return evaluateObject(node, scope)
    case 'MemberExpression': return evaluateMember(node, scope)
    case 'UnaryExpression': return evaluateUnary(node, scope)
    case 'BinaryExpression': return evaluateBinary(node, scope)
    case 'LogicalExpression': return evaluateLogical(node, scope)
    case 'ConditionalExpression': return evaluateConditional(node, scope)
    case 'TemplateLiteral': return evaluateTemplate(node, scope)
    default: return {ok: false, reason: `Unsupported expression type: ${node.type}`}
  }
}

function readYamlMetadata(root: AstNode, diagnostics: CompileDiagnostic[]): Record<string, unknown> {
  const yamlNode = root.children?.find(node => node.type === 'yaml')
  if (yamlNode?.value == null) return {}

  try {
    const value: unknown = parseYaml(yamlNode.value)
    if (isRecord(value)) return cloneSafe(value) as Record<string, unknown>
    diagnostics.push({
      severity: 'warning',
      code: 'invalid-frontmatter',
      message: 'YAML frontmatter must contain an object.',
    })
  } catch (error) {
    diagnostics.push({
      severity: 'warning',
      code: 'invalid-frontmatter',
      message: error instanceof Error ? error.message : String(error),
    })
  }
  return {}
}

function readExports(root: AstNode, baseScope: Record<string, unknown>, diagnostics: CompileDiagnostic[]): Record<string, unknown> {
  const exports: Record<string, unknown> = {}

  for (const node of root.children ?? []) {
    if (node.type !== 'mdxjsEsm') continue
    const program = node.data?.estree
    if (program == null) continue

    for (const statement of program.body) {
      if (statement.type === 'ImportDeclaration') continue
      if (statement.type === 'ExportDefaultDeclaration' && statement.declaration.type !== 'FunctionDeclaration' && statement.declaration.type !== 'ClassDeclaration') {
        const result = evaluateExpression(statement.declaration, mergeRecords(baseScope, exports))
        if (result.ok && isRecord(result.value)) {
          Object.assign(exports, cloneSafe(result.value))
        } else {
          diagnostics.push({severity: 'warning', code: 'unsupported-export', message: result.ok ? 'Default export must be an object.' : result.reason})
        }
        continue
      }
      if (statement.type === 'ExportNamedDeclaration' && statement.declaration?.type === 'VariableDeclaration' && statement.declaration.kind === 'const') {
        for (const declaration of statement.declaration.declarations) {
          if (declaration.id.type !== 'Identifier' || declaration.init == null) {
            diagnostics.push({severity: 'warning', code: 'unsupported-export', message: 'Only statically named const exports are supported.'})
            continue
          }
          const result = evaluateExpression(declaration.init, mergeRecords(baseScope, exports))
          if (result.ok) {
            exports[declaration.id.name] = cloneSafe(result.value)
          } else {
            diagnostics.push({severity: 'warning', code: 'unsupported-export', message: result.reason})
          }
        }
        continue
      }
      diagnostics.push({severity: 'warning', code: 'unsupported-export', message: 'Executable or re-exported ESM is omitted from preview.'})
    }
  }

  return exports
}

function formatValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  return JSON.stringify(value)
}

function expressionDiagnostic(value: string | undefined, reason: string): CompileDiagnostic {
  return {
    severity: 'warning',
    code: 'unsupported-expression',
    message: `${value == null || value === '' ? 'Expression' : `{${value}}`}: ${reason}`,
  }
}

function transformExpression(node: AstNode, scope: Record<string, unknown>, diagnostics: CompileDiagnostic[]): AstNode {
  const expression = expressionFromProgram(node.data?.estree)
  if (expression == null) {
    diagnostics.push(expressionDiagnostic(node.value, 'Expression AST is unavailable.'))
    return node
  }
  const result = evaluateExpression(expression, scope)
  if (!result.ok) {
    diagnostics.push(expressionDiagnostic(node.value, result.reason))
    return node
  }
  const text = {type: 'text', value: formatValue(result.value)}
  return node.type === 'mdxFlowExpression'
    ? {type: 'paragraph', children: [text]}
    : text
}

function readWhen(node: AstNode, scope: Record<string, unknown>): EvaluationResult {
  const attribute = node.attributes?.find(candidate => candidate.name === 'when')
  if (attribute == null) return {ok: true, value: true}
  if (typeof attribute.value === 'string') return {ok: true, value: attribute.value.length > 0}
  if (attribute.value == null) return {ok: true, value: true}
  const expression = expressionFromProgram(attribute.value.data?.estree)
  return expression == null
    ? {ok: false, reason: 'The when expression AST is unavailable.'}
    : evaluateExpression(expression, scope)
}

function transformChildren(nodes: readonly AstNode[], scope: Record<string, unknown>, diagnostics: CompileDiagnostic[]): AstNode[] {
  const transformed: AstNode[] = []

  for (const node of nodes) {
    if (node.type === 'mdxjsEsm') continue
    if (node.type === 'mdxTextExpression' || node.type === 'mdxFlowExpression') {
      transformed.push(transformExpression(node, scope, diagnostics))
      continue
    }
    if (node.type === 'mdxJsxTextElement' || node.type === 'mdxJsxFlowElement') {
      if (node.name === 'Md' || node.name === 'Md.Line') {
        const when = readWhen(node, scope)
        if (!when.ok) {
          diagnostics.push(expressionDiagnostic('when', when.reason))
          transformed.push(node)
        } else if (when.value) {
          transformed.push(...transformChildren(node.children ?? [], scope, diagnostics))
        }
        continue
      }
      diagnostics.push({
        severity: 'warning',
        code: 'unknown-component',
        message: `Unknown MDX component is preserved: ${node.name ?? '<fragment>'}`,
      })
      transformed.push(node)
      continue
    }
    if (node.children != null) {
      transformed.push({...node, children: transformChildren(node.children, scope, diagnostics)})
    } else {
      transformed.push(node)
    }
  }

  return transformed
}

export function compileMdx(source: string, settingsScope: Record<string, unknown> = {}): CompileResult {
  const diagnostics: CompileDiagnostic[] = []

  try {
    const root = processor.parse(source) as Root & AstNode
    const yamlMetadata = readYamlMetadata(root, diagnostics)
    const baseScope = mergeRecords(settingsScope, yamlMetadata)
    const exportMetadata = readExports(root, baseScope, diagnostics)
    const metadata = mergeRecords(yamlMetadata, exportMetadata)
    const scope = mergeRecords(settingsScope, yamlMetadata, exportMetadata)
    const transformed = {
      ...root,
      children: transformChildren(root.children, scope, diagnostics),
    } as Root
    const markdown = processor.stringify(transformed)

    return {markdown, metadata, diagnostics}
  } catch (error) {
    return {
      markdown: source,
      metadata: {},
      diagnostics: [{
        severity: 'error',
        code: 'parse-error',
        message: error instanceof Error ? error.message : String(error),
      }],
    }
  }
}
