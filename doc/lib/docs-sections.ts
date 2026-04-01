export const DOC_SECTION_LINKS = [
  {href: '/docs/quick-guide', label: 'Quick Guide', section: 'quick-guide'},
  {href: '/docs/cli', label: 'CLI', section: 'cli'},
  {href: '/docs/sdk', label: 'SDK', section: 'sdk'},
  {href: '/docs/mcp', label: 'MCP', section: 'mcp'},
  {href: '/docs/gui', label: 'GUI', section: 'gui'},
  {
    href: '/docs/technical-details',
    label: 'Technical Details',
    section: 'technical-details'
  },
  {
    href: '/docs/design-rationale',
    label: 'Design Rationale',
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
