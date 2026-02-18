import type {ProjectConfig} from '@/types/ConfigTypes'
import type {RulePrompt} from '@/types/InputTypes'
import {describe, expect, it} from 'vitest'
import {FilePathKind, PromptKind} from '@/types'
import {expandWithSubSeries, filterRulesByProjectConfig} from './ruleFilter'

function createMockRulePrompt(seriName: string | undefined): RulePrompt {
  const content = '# Rule body'
  return {
    type: PromptKind.Rule,
    content,
    length: content.length,
    filePathKind: FilePathKind.Relative,
    dir: {pathKind: FilePathKind.Relative, path: '.', basePath: '', getDirectoryName: () => '.', getAbsolutePath: () => '.'},
    markdownContents: [],
    yamlFrontMatter: {description: 'Test rule', globs: ['**/*.ts']},
    series: 'test',
    ruleName: 'test-rule',
    globs: ['**/*.ts'],
    scope: 'project',
    seriName
  }
}

describe('expandWithSubSeries', () => {
  it('should return same array when no subSeries match', () => {
    const result = expandWithSubSeries(['uniapp'], {vue: ['vue2', 'vue3']})
    expect(result).toEqual(['uniapp'])
  })

  it('should expand single name with children', () => {
    const result = expandWithSubSeries(['uniapp'], {uniapp: ['uniapp2', 'uniapp3']})
    expect(result).toEqual(['uniapp', 'uniapp2', 'uniapp3'])
  })

  it('should expand multiple names', () => {
    const result = expandWithSubSeries(['uniapp', 'vue'], {
      uniapp: ['uniapp2'],
      vue: ['vue2', 'vue3']
    })
    expect(result).toEqual(['uniapp', 'vue', 'uniapp2', 'vue2', 'vue3'])
  })

  it('should deduplicate expanded names', () => {
    const result = expandWithSubSeries(['uniapp', 'uniapp'], {uniapp: ['uniapp2', 'uniapp']})
    expect(result).toEqual(['uniapp', 'uniapp2'])
  })

  it('should handle empty subSeries', () => {
    const result = expandWithSubSeries(['uniapp'], {})
    expect(result).toEqual(['uniapp'])
  })

  it('should handle empty names array', () => {
    const result = expandWithSubSeries([], {uniapp: ['uniapp2']})
    expect(result).toEqual([])
  })
})

describe('filterRulesByProjectConfig', () => {
  it('should return all rules when no projectConfig', () => {
    const rules = [
      createMockRulePrompt('uniapp'),
      createMockRulePrompt('vue'),
      createMockRulePrompt(void 0)
    ]
    const result = filterRulesByProjectConfig(rules, void 0)
    expect(result).toHaveLength(3)
  })

  it('should return all rules when no rules config', () => {
    const rules = [createMockRulePrompt('uniapp'), createMockRulePrompt('vue')]
    const projectConfig: ProjectConfig = {mcp: {names: ['test']}}
    const result = filterRulesByProjectConfig(rules, projectConfig)
    expect(result).toHaveLength(2)
  })

  describe('include filtering', () => {
    it('should include only matching seriName', () => {
      const rules = [createMockRulePrompt('uniapp'), createMockRulePrompt('vue')]
      const projectConfig: ProjectConfig = {rules: {include: ['uniapp']}}
      const result = filterRulesByProjectConfig(rules, projectConfig)
      expect(result).toHaveLength(1)
      expect(result[0].seriName).toBe('uniapp')
    })

    it('should include all when seriName is undefined (backward compatible)', () => {
      const rules = [createMockRulePrompt(void 0), createMockRulePrompt('vue')]
      const projectConfig: ProjectConfig = {rules: {include: ['uniapp']}}
      const result = filterRulesByProjectConfig(rules, projectConfig)
      expect(result).toHaveLength(1)
      expect(result[0].seriName).toBeUndefined()
    })

    it('should handle empty include array', () => {
      const rules = [createMockRulePrompt('uniapp'), createMockRulePrompt('vue')]
      const projectConfig: ProjectConfig = {rules: {include: []}}
      const result = filterRulesByProjectConfig(rules, projectConfig)
      expect(result).toHaveLength(2)
    })

    it('should handle multiple include values', () => {
      const rules = [
        createMockRulePrompt('uniapp'),
        createMockRulePrompt('vue'),
        createMockRulePrompt('react')
      ]
      const projectConfig: ProjectConfig = {rules: {include: ['uniapp', 'vue']}}
      const result = filterRulesByProjectConfig(rules, projectConfig)
      expect(result).toHaveLength(2)
      expect(result.map(r => r.seriName)).toContain('uniapp')
      expect(result.map(r => r.seriName)).toContain('vue')
    })
  })

  describe('exclude filtering', () => {
    it('should exclude matching seriName', () => {
      const rules = [createMockRulePrompt('uniapp'), createMockRulePrompt('vue')]
      const projectConfig: ProjectConfig = {rules: {exclude: ['uniapp']}}
      const result = filterRulesByProjectConfig(rules, projectConfig)
      expect(result).toHaveLength(1)
      expect(result[0].seriName).toBe('vue')
    })

    it('should keep undefined seriName even when exclude exists (backward compatible)', () => {
      const rules = [createMockRulePrompt(void 0), createMockRulePrompt('uniapp')]
      const projectConfig: ProjectConfig = {rules: {exclude: ['uniapp']}}
      const result = filterRulesByProjectConfig(rules, projectConfig)
      expect(result).toHaveLength(1)
      expect(result[0].seriName).toBeUndefined()
    })

    it('should handle empty exclude array', () => {
      const rules = [createMockRulePrompt('uniapp'), createMockRulePrompt('vue')]
      const projectConfig: ProjectConfig = {rules: {exclude: []}}
      const result = filterRulesByProjectConfig(rules, projectConfig)
      expect(result).toHaveLength(2)
    })
  })

  describe('include + exclude combination', () => {
    it('should apply include then exclude', () => {
      const rules = [
        createMockRulePrompt('uniapp'),
        createMockRulePrompt('vue'),
        createMockRulePrompt('react')
      ]
      const projectConfig: ProjectConfig = {
        rules: {include: ['uniapp', 'vue'], exclude: ['uniapp']}
      }
      const result = filterRulesByProjectConfig(rules, projectConfig)
      expect(result).toHaveLength(1)
      expect(result[0].seriName).toBe('vue')
    })
  })

  describe('subSeries expansion', () => {
    it('should expand include with subSeries', () => {
      const rules = [
        createMockRulePrompt('uniapp'),
        createMockRulePrompt('uniapp3'),
        createMockRulePrompt('vue')
      ]
      const projectConfig: ProjectConfig = {
        rules: {
          include: ['uniapp'],
          subSeries: {uniapp: ['uniapp2', 'uniapp3']}
        }
      }
      const result = filterRulesByProjectConfig(rules, projectConfig)
      expect(result).toHaveLength(2)
      expect(result.map(r => r.seriName)).toContain('uniapp')
      expect(result.map(r => r.seriName)).toContain('uniapp3')
    })

    it('should expand exclude with subSeries', () => {
      const rules = [
        createMockRulePrompt('uniapp'),
        createMockRulePrompt('uniapp3'),
        createMockRulePrompt('vue')
      ]
      const projectConfig: ProjectConfig = {
        rules: {
          exclude: ['uniapp'],
          subSeries: {uniapp: ['uniapp3']}
        }
      }
      const result = filterRulesByProjectConfig(rules, projectConfig)
      expect(result).toHaveLength(1)
      expect(result[0].seriName).toBe('vue')
    })

    it('should expand both include and exclude', () => {
      const rules = [
        createMockRulePrompt('uniapp'),
        createMockRulePrompt('uniapp2'),
        createMockRulePrompt('uniapp3'),
        createMockRulePrompt('vue')
      ]
      const projectConfig: ProjectConfig = {
        rules: {
          include: ['uniapp'],
          exclude: ['uniapp2'],
          subSeries: {
            uniapp: ['uniapp2', 'uniapp3']
          }
        }
      }
      const result = filterRulesByProjectConfig(rules, projectConfig)
      expect(result).toHaveLength(2)
      expect(result.map(r => r.seriName)).toContain('uniapp')
      expect(result.map(r => r.seriName)).toContain('uniapp3')
    })
  })

  describe('edge cases', () => {
    it('should handle empty rules array', () => {
      const projectConfig: ProjectConfig = {rules: {include: ['uniapp']}}
      const result = filterRulesByProjectConfig([], projectConfig)
      expect(result).toHaveLength(0)
    })

    it('should handle all rules excluded', () => {
      const rules = [createMockRulePrompt('uniapp'), createMockRulePrompt('vue')]
      const projectConfig: ProjectConfig = {
        rules: {include: ['uniapp'], exclude: ['uniapp']}
      }
      const result = filterRulesByProjectConfig(rules, projectConfig)
      expect(result).toHaveLength(0)
    })

    it('should handle subSeries not matching any include', () => {
      const rules = [createMockRulePrompt('uniapp'), createMockRulePrompt('vue')]
      const projectConfig: ProjectConfig = {
        rules: {
          include: ['react'],
          subSeries: {react: ['react-native']}
        }
      }
      const result = filterRulesByProjectConfig(rules, projectConfig)
      expect(result).toHaveLength(0)
    })
  })
})
