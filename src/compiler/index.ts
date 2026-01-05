// Component registry exports
export {
  clearComponents,
  getComponents,
  hasComponent,
  registerComponent,
} from './component-registry'

// Expression evaluation export
export { evaluateExpression } from './expression-eval'

// Main compiler function
export { mdxToMd } from './mdx-to-md'

// Parser export
export { parseMdx } from './parser'

// Type exports
export type {
  ComponentHandler,
  EvaluationScope,
  MdxToMdOptions,
  ProcessingContext,
} from './types'

// Re-export MDX AST types for convenience
export type {
  MdxFlowExpression,
  MdxjsEsm,
  MdxJsxFlowElement,
  MdxJsxTextElement,
  MdxTextExpression,
  Root,
  RootContent,
} from './types'
