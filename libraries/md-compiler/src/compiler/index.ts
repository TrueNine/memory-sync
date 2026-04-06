export {
  clearComponents,
  getComponents,
  hasComponent,
  registerComponent
} from './component-registry'

export {
  isStaticallyEvaluable,
  parseExports,
  parseStaticValue
} from './export-parser' // Export parser exports

export type {
  ExportMetadata,
  MetadataSource,
  ParseExportOptions
} from './export-parser'

export {
  evaluateExpression
} from './expression-eval' // Expression evaluation export
export {
  evaluateJsxExpression,
  hasJsxInEstree
} from './jsx-expression-eval' // JSX expression evaluation export

export {
  mdxToMd
} from './mdx-to-md' // Main compiler function

export {
  parseMdx
} from './parser' // Parser export

export type {
  ComponentHandler,
  EvaluationScope,
  MdxToMdOptions,
  MdxToMdResult,
  ProcessingContext
} from './types'

export type {
  MdxFlowExpression,
  MdxjsEsm,
  MdxJsxFlowElement,
  MdxJsxTextElement,
  MdxTextExpression,
  Root,
  RootContent
} from './types'

export type {
  CodeStylePreferences,
  EnvironmentContext,
  MdxGlobalScope,
  ToolReferences,
  UserProfile
} from '@/globals'
