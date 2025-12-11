/**
 * System capabilities module
 * Exports all capability implementations for PluginContext
 */

export {
  cleanBlankLines,
  createBlankLineCleanerCapability,
  detectLineEnding,
  hasBom,
} from './blankLineCleaner'

export {
  createCodeBlockTransformCapability,
  extractCodeBlocks,
  reassembleCodeBlocks,
  transformJsonToToon,
} from './codeBlockTransform'

export {
  appendContent,
  applyInjections,
  createContentInjectionCapability,
  prependContent,
  sortInjectionsByPriority,
} from './contentInjection'
export type { ContentInjection } from './contentInjection'

export {
  applyFilenameTransform,
  applyTransformRule,
  createFilenameTransformer,
  matchesTransformRules,
  replaceUnderscores,
  toLowercase,
} from './filenameTransform'

export type {
  FilenameTransformOptions,
  FilenameTransformResult,
} from './filenameTransform'
export {
  addFrontMatter,
  createFrontMatterCapability,
  createMarkdownCapability,
  FrontMatterParseError,
  generateFrontMatter,
  generateFrontMatterByType,
  mergeFrontMatter,
  parseFrontMatter,
  removeBom,
  serializeFrontMatter,
} from './frontMatter'
