export const DOC_SECTION_LINKS = [
  {href: '/docs/cli', label: 'CLI', section: 'cli'},
  {href: '/docs/mcp', label: 'MCP', section: 'mcp'},
  {href: '/docs/gui', label: 'GUI', section: 'gui'},
  {
    href: '/docs/technical-details',
    label: '技术细节',
    section: 'technical-details'
  },
  {
    href: '/docs/design-rationale',
    label: '设计初衷',
    section: 'design-rationale'
  }
] as const

export type DocSectionName = (typeof DOC_SECTION_LINKS)[number]['section']

export const DOC_SECTION_NAMES = new Set<DocSectionName>(
  DOC_SECTION_LINKS.map(link => link.section)
)

export function isDocSectionName(value: string): value is DocSectionName {
  return DOC_SECTION_NAMES.has(value as DocSectionName)
}
