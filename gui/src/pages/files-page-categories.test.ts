import {describe, expect, it} from 'vitest'
import {FILE_CATEGORY_TABS, fileCategoryRootPrefix} from './files-page-categories'

describe('files page categories', () => {
  it('exposes app-like series tabs alongside existing categories', () => {
    expect(FILE_CATEGORY_TABS.map(tab => tab.value)).toEqual([
      'app',
      'ext',
      'arch',
      'skills',
      'commands',
      'agents'
    ])
  })

  it('uses the subagents root only for agents', () => {
    expect(fileCategoryRootPrefix('app')).toBe('app')
    expect(fileCategoryRootPrefix('ext')).toBe('ext')
    expect(fileCategoryRootPrefix('arch')).toBe('arch')
    expect(fileCategoryRootPrefix('skills')).toBe('skills')
    expect(fileCategoryRootPrefix('commands')).toBe('commands')
    expect(fileCategoryRootPrefix('agents')).toBe('subagents')
  })
})
