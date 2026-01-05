// Global scope type exports
export type {
  EnvironmentContext,
  MdxGlobalScope,
  ToolReferences,
  UserProfile,
} from '../globals'

// Component registry exports
export {
  clearComponents,
  getComponents,
  hasComponent,
  registerComponent,
} from './component-registry'

// Export parser exports
export { isStaticallyEvaluable, parseExports, parseStaticValue } from './export-parser'

export type { ExportMetadata, MetadataSource, ParseExportOptions } from './export-parser'
// Expression evaluation export
export { evaluateExpression } from './expression-eval'

// JSX expression evaluation export
export { evaluateJsxExpression, hasJsxInEstree } from './jsx-expression-eval'

// Main compiler function
export { mdxToMd } from './mdx-to-md'

// Parser export
export { parseMdx } from './parser'

// Type exports
export type {
  ComponentHandler,
  EvaluationScope,
  MdxToMdOptions,
  MdxToMdResult,
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
