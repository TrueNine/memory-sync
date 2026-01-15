export type { // Global scope type exports
  EnvironmentContext,
  MdxGlobalScope,
  ToolReferences,
  UserProfile,
} from '../globals'

export { // Component registry exports
  clearComponents,
  getComponents,
  hasComponent,
  registerComponent,
} from './component-registry'

export {
  isStaticallyEvaluable,
  parseExports,
  parseStaticValue,
} from './export-parser' // Export parser exports

export type {
  ExportMetadata,
  MetadataSource,
  ParseExportOptions,
} from './export-parser'
export {
  evaluateExpression,
} from './expression-eval' // Expression evaluation export

export {
  evaluateJsxExpression,
  hasJsxInEstree,
} from './jsx-expression-eval' // JSX expression evaluation export

export {
  mdxToMd,
} from './mdx-to-md' // Main compiler function

export {
  parseMdx,
} from './parser' // Parser export

export type { // Type exports
  ComponentHandler,
  EvaluationScope,
  MdxToMdOptions,
  MdxToMdResult,
  ProcessingContext,
} from './types'

export type { // Re-export MDX AST types for convenience
  MdxFlowExpression,
  MdxjsEsm,
  MdxJsxFlowElement,
  MdxJsxTextElement,
  MdxTextExpression,
  Root,
  RootContent,
} from './types'
