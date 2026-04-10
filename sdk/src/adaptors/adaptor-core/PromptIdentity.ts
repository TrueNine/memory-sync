import type {SkillPrompt, SubAgentPrompt} from './types'

function normalizePromptPath(value: string): string {
  return value
    .replaceAll('\\', '/')
    .replaceAll(/^\/+|\/+$/gu, '')
}

export function flattenPromptPath(value: string): string {
  const normalized = normalizePromptPath(value)
  if (normalized.length === 0) return ''

  return normalized
    .split('/')
    .filter(segment => segment.length > 0)
    .join('-')
}

export function deriveSubAgentIdentity(relativeName: string): {
  readonly agentPrefix?: string
  readonly agentName: string
  readonly canonicalName: string
} {
  const normalizedName = normalizePromptPath(relativeName)
  const segments = normalizedName
    .split('/')
    .filter(segment => segment.length > 0)

  const agentName = segments.at(-1) ?? normalizedName
  const prefixSegments = segments.slice(0, -1)
  const canonicalName = flattenPromptPath(normalizedName)
  const agentPrefix = prefixSegments.length > 0
    ? prefixSegments.join('-')
    : void 0

  return {
    ...agentPrefix != null && {agentPrefix},
    agentName,
    canonicalName: canonicalName.length > 0 ? canonicalName : agentName
  }
}

export function resolveSkillName(skill: Pick<SkillPrompt, 'dir' | 'skillName'>): string {
  return skill.skillName.trim().length > 0
    ? skill.skillName
    : skill.dir.getDirectoryName()
}

export function resolveSubAgentCanonicalName(
  subAgent: Pick<SubAgentPrompt, 'agentName' | 'canonicalName' | 'agentPrefix'>
): string {
  if (subAgent.canonicalName.trim().length > 0) return subAgent.canonicalName

  const fallback = subAgent.agentPrefix != null && subAgent.agentPrefix.length > 0
    ? `${subAgent.agentPrefix}-${subAgent.agentName}`
    : subAgent.agentName

  return flattenPromptPath(fallback)
}
