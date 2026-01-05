// jsx-expression-eval.ts
// Evaluates JavaScript expressions containing JSX elements

import type { Expression, Identifier, Program, Property, SpreadElement } from 'estree'
import type {
  JSXElement,
  JSXExpressionContainer,
  JSXFragment,
  JSXMemberExpression,
  JSXSpreadChild,
  JSXText,
} from 'estree-jsx'
import type { RootContent } from 'mdast'
import type { MdxFlowExpression, MdxJsxFlowElement, MdxTextExpression } from 'mdast-util-mdx'
import type { ProcessingContext } from './types'
import { isMdxComponent, processComponent } from './component-processor'
import { evaluateExpression } from './expression-eval'
import { convertJsxToMarkdown } from './jsx-converter'

type ProcessAstFn = (children: RootContent[], ctx: ProcessingContext) => Promise<RootContent[]>
type JSXChild = JSXText | JSXExpressionContainer | JSXSpreadChild | JSXElement | JSXFragment

/**
 * Checks if an estree AST contains JSX elements.
 */
export function hasJsxInEstree(estree: Program | undefined): boolean {
  if (estree == null) {
    return false
  }
  return JSON.stringify(estree).includes('"JSX')
}

/**
 * Evaluates an MDX expression that may contain JSX elements.
 */
export async function evaluateJsxExpression(
  node: MdxFlowExpression | MdxTextExpression,
  ctx: ProcessingContext,
  processAstFn: ProcessAstFn,
): Promise<RootContent[]> {
  const estree = (node.data as { estree?: Program } | undefined)?.estree
  if (estree == null || estree.body.length === 0) {
    return []
  }

  const stmt = estree.body[0]
  if (stmt?.type !== 'ExpressionStatement') {
    return []
  }

  return evaluateEstreeExpression(stmt.expression, ctx, processAstFn)
}

/**
 * Evaluates an estree expression node, handling JSX elements.
 */
async function evaluateEstreeExpression(
  expr: Expression,
  ctx: ProcessingContext,
  processAstFn: ProcessAstFn,
): Promise<RootContent[]> {
  // Handle JSX types first
  if (expr.type === 'JSXElement') {
    return processJsxElement(expr as unknown as JSXElement, ctx, processAstFn)
  }
  if (expr.type === 'JSXFragment') {
    return processJsxFragment(expr as unknown as JSXFragment, ctx, processAstFn)
  }
  if (expr.type === 'LogicalExpression') {
    return evaluateLogicalExpression(expr, ctx, processAstFn)
  }
  if (expr.type === 'ConditionalExpression') {
    return evaluateConditionalExpression(expr, ctx, processAstFn)
  }
  if (expr.type === 'SequenceExpression') {
    return evaluateSequenceExpression(expr, ctx, processAstFn)
  }
  if (expr.type === 'ArrayExpression') {
    return evaluateArrayExpression(expr, ctx, processAstFn)
  }
  // For all other expressions, use standard evaluator
  return evaluateNonJsxExpression(expr, ctx)
}

async function evaluateLogicalExpression(
  expr: Expression & { type: 'LogicalExpression' },
  ctx: ProcessingContext,
  processAstFn: ProcessAstFn,
): Promise<RootContent[]> {
  const leftValue = await evaluateToValue(expr.left, ctx, processAstFn)

  if (expr.operator === '&&') {
    if (isTruthy(leftValue)) {
      return evaluateEstreeExpression(expr.right, ctx, processAstFn)
    }
    return []
  }
  if (expr.operator === '||') {
    if (isTruthy(leftValue)) {
      if (isJsxExpression(expr.left)) {
        return evaluateEstreeExpression(expr.left, ctx, processAstFn)
      }
      return valueToRootContent(leftValue)
    }
    return evaluateEstreeExpression(expr.right, ctx, processAstFn)
  }
  if (expr.operator === '??') {
    if (leftValue != null) {
      if (isJsxExpression(expr.left)) {
        return evaluateEstreeExpression(expr.left, ctx, processAstFn)
      }
      return valueToRootContent(leftValue)
    }
    return evaluateEstreeExpression(expr.right, ctx, processAstFn)
  }
  return []
}

async function evaluateConditionalExpression(
  expr: Expression & { type: 'ConditionalExpression' },
  ctx: ProcessingContext,
  processAstFn: ProcessAstFn,
): Promise<RootContent[]> {
  const testValue = await evaluateToValue(expr.test, ctx, processAstFn)
  if (isTruthy(testValue)) {
    return evaluateEstreeExpression(expr.consequent, ctx, processAstFn)
  }
  return evaluateEstreeExpression(expr.alternate, ctx, processAstFn)
}

async function evaluateSequenceExpression(
  expr: Expression & { type: 'SequenceExpression' },
  ctx: ProcessingContext,
  processAstFn: ProcessAstFn,
): Promise<RootContent[]> {
  const results: RootContent[] = []
  for (const e of expr.expressions) {
    const r = await evaluateEstreeExpression(e, ctx, processAstFn)
    results.push(...r)
  }
  return results
}

async function evaluateArrayExpression(
  expr: Expression & { type: 'ArrayExpression' },
  ctx: ProcessingContext,
  processAstFn: ProcessAstFn,
): Promise<RootContent[]> {
  const results: RootContent[] = []
  for (const element of expr.elements) {
    if (element == null) {
      continue
    }
    if (element.type === 'SpreadElement') {
      const spreadResult = await evaluateEstreeExpression(element.argument, ctx, processAstFn)
      results.push(...spreadResult)
    } else {
      const r = await evaluateEstreeExpression(element, ctx, processAstFn)
      results.push(...r)
    }
  }
  return results
}

async function evaluateToValue(
  expr: Expression,
  ctx: ProcessingContext,
  processAstFn: ProcessAstFn,
): Promise<unknown> {
  if (isJsxExpression(expr)) {
    return true
  }

  if (expr.type === 'Literal') {
    return expr.value
  }

  if (expr.type === 'Identifier') {
    if (expr.name === 'undefined') {
      return void 0
    }
    if (expr.name === 'NaN') {
      return Number.NaN
    }
    if (expr.name === 'Infinity') {
      return Number.POSITIVE_INFINITY
    }
    return ctx.scope[expr.name]
  }

  if (expr.type === 'UnaryExpression') {
    const arg = await evaluateToValue(expr.argument, ctx, processAstFn)
    if (expr.operator === '!') {
      return !isTruthy(arg)
    }
    if (expr.operator === '-') {
      return -(arg as number)
    }
    if (expr.operator === '+') {
      return +(arg as number)
    }
    if (expr.operator === 'typeof') {
      return typeof arg
    }
    return void 0
  }

  if (expr.type === 'BinaryExpression') {
    const left = await evaluateToValue(expr.left as Expression, ctx, processAstFn)
    const right = await evaluateToValue(expr.right, ctx, processAstFn)
    if (expr.operator === '===') {
      return left === right
    }
    if (expr.operator === '!==') {
      return left !== right
    }
    // Use strict equality for == and !=
    if (expr.operator === '==') {
      return left === right
    }
    if (expr.operator === '!=') {
      return left !== right
    }
    if (expr.operator === '<') {
      return (left as number) < (right as number)
    }
    if (expr.operator === '<=') {
      return (left as number) <= (right as number)
    }
    if (expr.operator === '>') {
      return (left as number) > (right as number)
    }
    if (expr.operator === '>=') {
      return (left as number) >= (right as number)
    }
    if (expr.operator === '+') {
      return (left as number) + (right as number)
    }
    if (expr.operator === '-') {
      return (left as number) - (right as number)
    }
    if (expr.operator === '*') {
      return (left as number) * (right as number)
    }
    if (expr.operator === '/') {
      return (left as number) / (right as number)
    }
    if (expr.operator === '%') {
      return (left as number) % (right as number)
    }
    return void 0
  }

  if (expr.type === 'LogicalExpression') {
    const left = await evaluateToValue(expr.left, ctx, processAstFn)
    if (expr.operator === '&&') {
      return isTruthy(left) ? evaluateToValue(expr.right, ctx, processAstFn) : left
    }
    if (expr.operator === '||') {
      return isTruthy(left) ? left : evaluateToValue(expr.right, ctx, processAstFn)
    }
    if (expr.operator === '??') {
      return left != null ? left : evaluateToValue(expr.right, ctx, processAstFn)
    }
    return void 0
  }

  if (expr.type === 'MemberExpression') {
    const obj = await evaluateToValue(expr.object as Expression, ctx, processAstFn) as Record<string, unknown>
    if (obj == null) {
      return void 0
    }
    if (expr.computed) {
      const prop = await evaluateToValue(expr.property as Expression, ctx, processAstFn)
      return obj[prop as string]
    }
    const prop = (expr.property as Identifier).name
    return obj[prop]
  }

  if (expr.type === 'ConditionalExpression') {
    const test = await evaluateToValue(expr.test, ctx, processAstFn)
    return isTruthy(test)
      ? evaluateToValue(expr.consequent, ctx, processAstFn)
      : evaluateToValue(expr.alternate, ctx, processAstFn)
  }

  const source = estreeToSource(expr)
  if (source === '') {
    return void 0
  }

  try {
    const result = evaluateExpression(source, ctx.scope)
    if (result === 'true') {
      return true
    }
    if (result === 'false') {
      return false
    }
    if (result === 'null') {
      return null
    }
    if (result === 'undefined' || result === '') {
      return void 0
    }
    if (/^-?\d+(?:\.\d+)?$/.test(result)) {
      return Number(result)
    }
    return result
  } catch {
    return void 0
  }
}

async function processJsxElement(
  jsxElement: JSXElement,
  ctx: ProcessingContext,
  processAstFn: ProcessAstFn,
): Promise<RootContent[]> {
  const mdxElement = convertEstreeJsxToMdx(jsxElement, ctx)

  if (mdxElement.name != null && isMdxComponent(mdxElement.name, ctx)) {
    const { processAst } = await import('./transformer')
    return processComponent(mdxElement, ctx, processAst)
  }

  const converted = convertJsxToMarkdown(mdxElement, ctx)
  if (converted != null) {
    return converted
  }

  if (mdxElement.children.length > 0) {
    return processAstFn(mdxElement.children as RootContent[], ctx)
  }

  return []
}

async function processJsxFragment(
  fragment: JSXFragment,
  ctx: ProcessingContext,
  processAstFn: ProcessAstFn,
): Promise<RootContent[]> {
  const results: RootContent[] = []
  for (const child of fragment.children) {
    const r = await processJsxChild(child, ctx, processAstFn)
    results.push(...r)
  }
  return results
}

async function processJsxChild(
  child: JSXChild,
  ctx: ProcessingContext,
  processAstFn: ProcessAstFn,
): Promise<RootContent[]> {
  if (child.type === 'JSXElement') {
    return processJsxElement(child, ctx, processAstFn)
  }
  if (child.type === 'JSXFragment') {
    return processJsxFragment(child, ctx, processAstFn)
  }
  if (child.type === 'JSXText') {
    const text = child.value.trim()
    if (text === '') {
      return []
    }
    return [{ type: 'paragraph', children: [{ type: 'text', value: text }] }]
  }
  if (child.type === 'JSXExpressionContainer') {
    if (child.expression.type === 'JSXEmptyExpression') {
      return []
    }
    return evaluateEstreeExpression(child.expression, ctx, processAstFn)
  }
  if (child.type === 'JSXSpreadChild') {
    return evaluateEstreeExpression(child.expression, ctx, processAstFn)
  }
  return []
}

function convertEstreeJsxToMdx(jsxElement: JSXElement, _ctx: ProcessingContext): MdxJsxFlowElement {
  const opening = jsxElement.openingElement

  let name: string | null = null
  if (opening.name.type === 'JSXIdentifier') {
    name = opening.name.name
  } else if (opening.name.type === 'JSXMemberExpression') {
    name = jsxMemberExpressionToString(opening.name)
  } else if (opening.name.type === 'JSXNamespacedName') {
    name = `${opening.name.namespace.name}:${opening.name.name.name}`
  }

  const attributes: MdxJsxFlowElement['attributes'] = []
  for (const attr of opening.attributes) {
    if (attr.type === 'JSXAttribute') {
      const attrName = attr.name.type === 'JSXIdentifier'
        ? attr.name.name
        : `${attr.name.namespace.name}:${attr.name.name.name}`

      let attrValue: string | { type: 'mdxJsxAttributeValueExpression', value: string } | null | undefined = null

      if (attr.value == null) {
        attrValue = null
      } else if (attr.value.type === 'Literal') {
        attrValue = String(attr.value.value)
      } else if (attr.value.type === 'JSXExpressionContainer') {
        if (attr.value.expression.type !== 'JSXEmptyExpression') {
          attrValue = {
            type: 'mdxJsxAttributeValueExpression' as const,
            value: estreeToSource(attr.value.expression),
          }
        }
      }

      attributes.push({ type: 'mdxJsxAttribute', name: attrName, value: attrValue })
    } else if (attr.type === 'JSXSpreadAttribute') {
      attributes.push({
        type: 'mdxJsxExpressionAttribute',
        value: `...${estreeToSource(attr.argument)}`,
      })
    }
  }

  const children: RootContent[] = []
  for (const child of jsxElement.children) {
    const converted = convertEstreeJsxChildToMdx(child, _ctx)
    if (converted != null) {
      children.push(...converted)
    }
  }

  return { type: 'mdxJsxFlowElement', name, attributes, children } as MdxJsxFlowElement
}

function jsxMemberExpressionToString(expr: JSXMemberExpression): string {
  if (expr.object.type === 'JSXIdentifier') {
    return `${expr.object.name}.${expr.property.name}`
  }
  return `${jsxMemberExpressionToString(expr.object)}.${expr.property.name}`
}

function convertEstreeJsxChildToMdx(child: JSXChild, ctx: ProcessingContext): RootContent[] | null {
  if (child.type === 'JSXText') {
    const value = child.value
    if (value.trim() === '') {
      return null
    }
    return [{ type: 'paragraph', children: [{ type: 'text', value }] }]
  }
  if (child.type === 'JSXElement') {
    return [convertEstreeJsxToMdx(child, ctx) as unknown as RootContent]
  }
  if (child.type === 'JSXFragment') {
    const results: RootContent[] = []
    for (const c of child.children) {
      const converted = convertEstreeJsxChildToMdx(c, ctx)
      if (converted != null) {
        results.push(...converted)
      }
    }
    return results
  }
  if (child.type === 'JSXExpressionContainer') {
    if (child.expression.type === 'JSXEmptyExpression') {
      return null
    }
    const source = estreeToSource(child.expression)
    return [{ type: 'paragraph', children: [{ type: 'text', value: source }] }]
  }
  if (child.type === 'JSXSpreadChild') {
    const source = `...${estreeToSource(child.expression)}`
    return [{ type: 'paragraph', children: [{ type: 'text', value: source }] }]
  }
  return null
}

function estreeToSource(expr: Expression | SpreadElement): string {
  if (expr.type === 'Identifier') {
    return expr.name
  }
  if (expr.type === 'Literal') {
    if (typeof expr.value === 'string') {
      return JSON.stringify(expr.value)
    }
    return String(expr.value)
  }
  if (expr.type === 'MemberExpression') {
    const obj = estreeToSource(expr.object as Expression)
    if (expr.computed) {
      const prop = estreeToSource(expr.property as Expression)
      return `${obj}[${prop}]`
    }
    const prop = (expr.property as Identifier).name
    return `${obj}.${prop}`
  }
  if (expr.type === 'CallExpression') {
    const callee = estreeToSource(expr.callee as Expression)
    const args = expr.arguments.map((a) => estreeToSource(a)).join(', ')
    return `${callee}(${args})`
  }
  if (expr.type === 'BinaryExpression' || expr.type === 'LogicalExpression') {
    const left = estreeToSource(expr.left as Expression)
    const right = estreeToSource(expr.right)
    return `(${left} ${expr.operator} ${right})`
  }
  if (expr.type === 'UnaryExpression') {
    const arg = estreeToSource(expr.argument)
    return `${expr.operator}${arg}`
  }
  if (expr.type === 'ConditionalExpression') {
    const test = estreeToSource(expr.test)
    const consequent = estreeToSource(expr.consequent)
    const alternate = estreeToSource(expr.alternate)
    return `(${test} ? ${consequent} : ${alternate})`
  }
  if (expr.type === 'ArrayExpression') {
    const elements = expr.elements
      .filter((e): e is Expression => e != null && e.type !== 'SpreadElement')
      .map((e) => estreeToSource(e))
      .join(', ')
    return `[${elements}]`
  }
  if (expr.type === 'ObjectExpression') {
    const props = expr.properties
      .filter((p): p is Property => p.type === 'Property')
      .map((p) => {
        const key = p.key.type === 'Identifier' ? p.key.name : estreeToSource(p.key as Expression)
        const value = estreeToSource(p.value as Expression)
        return `${key}: ${value}`
      })
      .join(', ')
    return `{${props}}`
  }
  if (expr.type === 'TemplateLiteral') {
    let result = '`'
    for (let i = 0; i < expr.quasis.length; i++) {
      result += expr.quasis[i]?.value.raw ?? ''
      if (i < expr.expressions.length) {
        result += `\${${estreeToSource(expr.expressions[i] as Expression)}}`
      }
    }
    result += '`'
    return result
  }
  if (expr.type === 'SpreadElement') {
    return `...${estreeToSource(expr.argument)}`
  }
  return ''
}

function isJsxExpression(expr: Expression): boolean {
  return expr.type === 'JSXElement' || expr.type === 'JSXFragment'
}

function isTruthy(value: unknown): boolean {
  return Boolean(value)
}

function valueToRootContent(value: unknown): RootContent[] {
  if (value == null) {
    return []
  }
  const str = typeof value === 'string' ? value : String(value)
  if (str === '' || str === 'undefined' || str === 'null') {
    return []
  }
  return [{ type: 'paragraph', children: [{ type: 'text', value: str }] }]
}

function evaluateNonJsxExpression(expr: Expression, ctx: ProcessingContext): RootContent[] {
  const source = estreeToSource(expr)
  if (source === '') {
    return []
  }
  try {
    const result = evaluateExpression(source, ctx.scope)
    return valueToRootContent(result)
  } catch {
    return []
  }
}
