// types.ts
// Shared TypeScript types for the lossless MDX to Markdown converter

import type { Root, RootContent } from 'mdast'
import type {
  MdxFlowExpression,
  MdxjsEsm,
  MdxJsxFlowElement,
  MdxJsxTextElement,
  MdxTextExpression,
} from 'mdast-util-mdx'

/** Scope containing resolved imports and their values */
export interface EvaluationScope {
  [key: string]: unknown
}

/** Information about an imported module */
export interface ImportInfo {
  /** The import specifier (e.g., "./file.json") */
  source: string
  /** Named imports (e.g., { name, description }) */
  namedImports: Map<string, string>
  /** Default import name (e.g., Component) */
  defaultImport?: string
  /** Whether this is an MDX component import */
  isMdxComponent: boolean
}

/** Context passed through the processing pipeline */
export interface ProcessingContext {
  /** Evaluation scope with resolved imports */
  scope: EvaluationScope
  /** Map of component names to their content */
  components: Map<string, string>
  /** Stack of component names being processed (for circular dependency detection) */
  processingStack: string[]
}

/** Options for the mdxToMd function */
export interface MdxToMdOptions {
  /** Custom scope values to inject */
  scope?: EvaluationScope
  /** Map of component names to their MDX content */
  components?: Map<string, string> | Record<string, string>
}

// Re-export MDX-specific types for convenience
export type {
  MdxFlowExpression,
  MdxjsEsm,
  MdxJsxFlowElement,
  MdxJsxTextElement,
  MdxTextExpression,
  Root,
  RootContent,
}
