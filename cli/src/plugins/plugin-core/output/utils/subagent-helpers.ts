import type {SubAgentPrompt} from '../../plugin-shared/types/InputTypes'
import type {SubAgentFrontMatterField, SubAgentOutputConfig} from '../../plugin-shared/types/OutputTypes'

import {buildMarkdownWithFrontMatter, transformMdxReferencesToMd} from '@truenine/md-compiler/markdown'

/**
 * Built-in file name templates for SubAgent output
 */
export type SubAgentFileNameTemplate = 'prefix-agent' | 'prefix_agent' | 'agent'

/**
 * Build SubAgent file name based on configuration
 */
export function buildSubAgentFileName(
  subAgent: SubAgentPrompt,
  config: SubAgentOutputConfig
): string {
  const template = config.fileNameTemplate ?? 'prefix-agent'

  if (template === 'prefix-agent') { // Built-in templates
    return subAgent.agentPrefix != null && subAgent.agentPrefix !== ''
      ? `${subAgent.agentPrefix}-${subAgent.agentName}.md`
      : `${subAgent.agentName}.md`
  }

  if (template === 'prefix_agent') {
    return subAgent.agentPrefix != null && subAgent.agentPrefix !== ''
      ? `${subAgent.agentPrefix}_${subAgent.agentName}.md`
      : `${subAgent.agentName}.md`
  }

  if (template === 'agent') return `${subAgent.agentName}.md`

  return template // Custom template string with {{placeholder}} syntax
    .replaceAll('{{prefix}}', subAgent.agentPrefix ?? '')
    .replaceAll('{{agentName}}', subAgent.agentName)
}

/**
 * Evaluate a frontmatter field value
 */
function evaluateFrontMatterField(
  field: SubAgentFrontMatterField,
  subAgent: SubAgentPrompt
): unknown {
  if (typeof field === 'function') return field(subAgent)
  return field
}

/**
 * Build frontmatter data for SubAgent
 */
export function buildSubAgentFrontMatter(
  subAgent: SubAgentPrompt,
  config: SubAgentOutputConfig
): Record<string, unknown> {
  if (config.frontMatter?.enabled !== true) return {}

  const {fields} = config.frontMatter
  if (fields === void 0) return {}

  const fmData: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) fmData[key] = evaluateFrontMatterField(value, subAgent)

  return fmData
}

/**
 * Build SubAgent content with transformations
 */
export function buildSubAgentContent(
  subAgent: SubAgentPrompt,
  config: SubAgentOutputConfig
): string {
  let {content} = subAgent
  const {contentTransform: transformConfig} = config

  if (transformConfig?.transformMdxRefs !== false) content = transformMdxReferencesToMd(content)

  if (transformConfig?.processor != null) content = transformConfig.processor(content, subAgent)

  if (config.frontMatter?.enabled !== true) return content

  const fmData = buildSubAgentFrontMatter(subAgent, config)
  content = buildMarkdownWithFrontMatter(fmData, content)
  return content
}

/**
 * Get default SubAgent output configuration
 */
export function getDefaultSubAgentConfig(): SubAgentOutputConfig {
  return {
    enabled: false,
    fileNameTemplate: 'prefix-agent',
    includeSeriesPrefix: true,
    seriesSeparator: '-',
    frontMatter: {enabled: false},
    contentTransform: {transformMdxRefs: true}
  }
}

/**
 * Merge user config with defaults
 * Returns user config as-is; defaults are applied at runtime in helper functions
 */
export function mergeSubAgentConfig(
  userConfig?: SubAgentOutputConfig
): SubAgentOutputConfig | undefined {
  return userConfig
}
