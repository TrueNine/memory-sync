export type FileCategory = 'app' | 'ext' | 'arch' | 'skills' | 'commands' | 'agents'

export const FILE_CATEGORY_TABS: readonly {readonly value: FileCategory, readonly labelKey: string}[] = [
  {value: 'app', labelKey: 'files.tab.app'},
  {value: 'ext', labelKey: 'files.tab.ext'},
  {value: 'arch', labelKey: 'files.tab.arch'},
  {value: 'skills', labelKey: 'files.tab.skills'},
  {value: 'commands', labelKey: 'files.tab.commands'},
  {value: 'agents', labelKey: 'files.tab.agents'}
]

export function fileCategoryRootPrefix(category: FileCategory): string {
  if (category === 'agents') return 'subagents'
  return category
}
