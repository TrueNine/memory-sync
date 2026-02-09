import type {RootContent} from 'mdast' // Shared TypeScript types for the lossless MDX to Markdown converter // types.ts
import type {
  MdxJsxFlowElement,
  MdxJsxTextElement
} from 'mdast-util-mdx'
import type {ExportMetadata} from './export-parser'
import type {MdxGlobalScope} from '@/globals'

/** Scope containing values available for expression evaluation */
export interface EvaluationScope {
  [key: string]: unknown
}

/**
 * Component handler signature for built-in components.
 * Handlers receive the JSX element, processing context, and a function to process children.
 */
export type ComponentHandler = (
  element: MdxJsxFlowElement | MdxJsxTextElement,
  ctx: ProcessingContext,
  processChildren: (children: RootContent[], ctx: ProcessingContext) => Promise<RootContent[]>
) => Promise<RootContent[]>

/** Simplified processing context without import tracking */
export interface ProcessingContext {
  /** Merged evaluation scope (globals + user scope) */
  scope: EvaluationScope
  /** Built-in component handlers */
  components: Map<string, ComponentHandler>
  /** Stack for circular dependency detection */
  processingStack: string[]
  /** Base path for resolving relative file references */
  basePath?: string
}

/** Options for the mdxToMd function */
export interface MdxToMdOptions {
  /** Custom scope values (override globals) */
  scope?: EvaluationScope
  /** Base path for file resolution */
  basePath?: string
  globalScope?: MdxGlobalScope | undefined
  extractMetadata?: boolean
}

/** Result of mdxToMd when extractMetadata is true */
export interface MdxToMdResult {
  /** Compiled Markdown content */
  content: string
  /** Extracted metadata from export statements */
  metadata: ExportMetadata
} // Re-export MDX-specific types for convenience

export {
  type Root,
  type RootContent
} from 'mdast'
export {
  type MdxFlowExpression,
  type MdxjsEsm,
  type MdxJsxFlowElement,
  type MdxJsxTextElement,
  type MdxTextExpression
} from 'mdast-util-mdx'
