import type {YAML} from 'mdast' // Main entry point for lossless MDX to Markdown conversion // mdx-to-md.ts
import type {EvaluationScope, MdxjsEsm, MdxToMdOptions, MdxToMdResult, ProcessingContext} from './types'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkStringify from 'remark-stringify'
import {unified} from 'unified'
import * as YAML_LIB from 'yaml'
import {registerBuiltInComponents} from '@/components'
import {getComponents} from './component-registry'
import {parseExports} from './export-parser'
import {parseMdx} from './parser'
import {processAst} from './transformer'

registerBuiltInComponents() // Register built-in components on module load

/**
 * Merges global scope with custom scope.
 * Custom scope values take precedence over global scope values.
 * Objects are deeply merged, primitives are overwritten.
 *
 * @param globalScope - Global scope containing os, env, profile, tool
 * @param customScope - Custom scope values to merge
 * @returns Merged evaluation scope
 */
function mergeScopes(
  globalScope: MdxToMdOptions['globalScope'],
  customScope: EvaluationScope | undefined
): EvaluationScope {
  const result: EvaluationScope = {}

  if (globalScope != null) { // 1. Add global scope first (lower priority)
    result['os'] = {...globalScope.os}
    result['env'] = {...globalScope.env}
    result['profile'] = {...globalScope.profile}
    result['tool'] = {...globalScope.tool}
  }

  if (customScope != null) { // 2. Merge custom scope (higher priority)
    for (const [key, value] of Object.entries(customScope)) {
      const existingValue = result[key]
      result[key] = typeof value === 'object' // Deep merge objects
        && value !== null
        && !Array.isArray(value)
        && typeof existingValue === 'object'
        && existingValue !== null
        && !Array.isArray(existingValue)
        ? {
            ...(existingValue as Record<string, unknown>),
            ...(value as Record<string, unknown>)
          }
        : value
    }
  }

  return result
}

export async function mdxToMd(
  content: string,
  options?: MdxToMdOptions & {extractMetadata?: false}
): Promise<string>

export async function mdxToMd(
  content: string,
  options: MdxToMdOptions & {extractMetadata: true}
): Promise<MdxToMdResult>

export async function mdxToMd(
  content: string,
  options?: MdxToMdOptions
): Promise<string | MdxToMdResult> {
  const ast = parseMdx(content)

  const mergedScope = mergeScopes(options?.globalScope, options?.scope) // Merge global scope with custom scope

  const components = getComponents() // Load built-in components from registry

  let metadata: MdxToMdResult['metadata'] | undefined // Extract metadata if requested (YAML frontmatter + ESM exports merged)
  if (options?.extractMetadata === true) {
    const yamlNode = ast.children.find((n): n is YAML => n.type === 'yaml') // 1. Extract YAML frontmatter
    let yamlFrontMatter: Record<string, unknown> | undefined
    if (yamlNode != null) {
      try {
        yamlFrontMatter = YAML_LIB.parse(yamlNode.value) as Record<string, unknown>
      }
      catch {
      } // YAML parsing failed, ignore
    }

    const esmNodes = ast.children.filter((n): n is MdxjsEsm => n.type === 'mdxjsEsm') // 2. Extract ESM exports

    metadata = parseExports(esmNodes, { // 3. Merge: export takes priority over YAML
      ...yamlFrontMatter != null && {yamlFrontMatter},
      scope: mergedScope,
      ...options?.basePath != null && {filePath: options.basePath}
    })

    ast.children = ast.children.filter(n => n.type !== 'yaml' && n.type !== 'mdxjsEsm') // 4. Remove YAML and ESM nodes from AST (clean content output)
  }

  const ctx: ProcessingContext = {
    scope: mergedScope,
    components,
    processingStack: [],
    ...options?.basePath != null && {basePath: options.basePath}
  }

  const processedAst = await processAst(ast, ctx)

  const processor = unified()
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm)
    .use(remarkStringify, {
      bullet: '-',
      fence: '`',
      fences: true,
      emphasis: '*',
      strong: '*',
      rule: '-',
      handlers: {
        text(node: {value: string}) { // Custom text handler to avoid unnecessary escaping
          return node.value
        }
      }
    })

  const markdown = processor.stringify(processedAst).trim()

  if (options?.extractMetadata === true && metadata != null) return {content: markdown, metadata} // Return result with metadata if extractMetadata is true

  return markdown
}
