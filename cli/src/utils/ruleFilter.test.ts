import type {ProjectConfig, RulePrompt} from '@truenine/plugin-shared'
import {FilePathKind, PromptKind} from '@truenine/plugin-shared'
import {describe, expect, it} from 'vitest'
import {applySubSeriesGlobPrefix, filterRulesByProjectConfig} from './ruleFilter'

function createMockRulePrompt(seriName: string | undefined, globs: readonly string[] = ['**/*.ts']): RulePrompt {
  const content = '# Rule body'
  return {
    type: PromptKind.Rule,
    content,
    length: content.length,
    filePathKind: FilePathKind.Relative,
    dir: {pathKind: FilePathKind.Relative, path: '.', basePath: '', getDirectoryName: () => '.', getAbsolutePath: () => '.'},
    markdownContents: [],
    yamlFrontMatter: {description: 'Test rule', globs: [...globs]},
    series: 'test',
    ruleName: 'test-rule',
    globs: [...globs],
    scope: 'project',
    seriName
  }
}

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
  })
})

describe('applySubSeriesGlobPrefix', () => {
  describe('basic functionality', () => {
    it('should return original rules when no projectConfig', () => {
      const rules = [createMockRulePrompt('uniapp')]
      const result = applySubSeriesGlobPrefix(rules, void 0)
      expect(result).toEqual(rules)
    })

    it('should return original rules when no subSeries config', () => {
      const rules = [createMockRulePrompt('uniapp')]
      const projectConfig: ProjectConfig = {rules: {include: ['uniapp']}}
      const result = applySubSeriesGlobPrefix(rules, projectConfig)
      expect(result).toEqual(rules)
    })

    it('should return original rules when empty subSeries', () => {
      const rules = [createMockRulePrompt('uniapp')]
      const projectConfig: ProjectConfig = {rules: {subSeries: {}}}
      const result = applySubSeriesGlobPrefix(rules, projectConfig)
      expect(result).toEqual(rules)
    })

    it('should return original rules when seriName is undefined', () => {
      const rules = [createMockRulePrompt(void 0)]
      const projectConfig: ProjectConfig = {
        rules: {subSeries: {applet: ['uniapp3']}}
      }
      const result = applySubSeriesGlobPrefix(rules, projectConfig)
      expect(result).toEqual(rules)
    })
  })

  describe('glob prefix addition', () => {
    it('should add prefix to globs when seriName matches', () => {
      const rules = [createMockRulePrompt('uniapp3', ['**/*.vue'])]
      const projectConfig: ProjectConfig = {
        rules: {subSeries: {applet: ['uniapp3']}}
      }
      const result = applySubSeriesGlobPrefix(rules, projectConfig)
      expect(result[0].globs).toEqual(['applet/**/*.vue'])
    })

    it('should add prefix to multiple globs', () => {
      const rules = [createMockRulePrompt('uniapp3', ['**/*.vue', '**/*.ts'])]
      const projectConfig: ProjectConfig = {
        rules: {subSeries: {applet: ['uniapp3']}}
      }
      const result = applySubSeriesGlobPrefix(rules, projectConfig)
      expect(result[0].globs).toEqual(['applet/**/*.vue', 'applet/**/*.ts'])
    })

    it('should add multiple prefixes when seriName matches multiple subdirs', () => {
      const rules = [createMockRulePrompt('uniapp3', ['**/*.vue'])]
      const projectConfig: ProjectConfig = {
        rules: {subSeries: {applet: ['uniapp3'], example_applet: ['uniapp3']}}
      }
      const result = applySubSeriesGlobPrefix(rules, projectConfig)
      expect(result[0].globs).toEqual(['applet/**/*.vue', 'example_applet/**/*.vue'])
    })

    it('should return original rule when seriName does not match', () => {
      const rules = [createMockRulePrompt('vue', ['**/*.vue'])]
      const projectConfig: ProjectConfig = {
        rules: {subSeries: {applet: ['uniapp3']}}
      }
      const result = applySubSeriesGlobPrefix(rules, projectConfig)
      expect(result[0].globs).toEqual(['**/*.vue'])
    })
  })

  describe('glob format handling', () => {
    it('should handle globs starting with **/', () => {
      const rules = [createMockRulePrompt('uniapp3', ['**/*.vue'])]
      const projectConfig: ProjectConfig = {
        rules: {subSeries: {applet: ['uniapp3']}}
      }
      const result = applySubSeriesGlobPrefix(rules, projectConfig)
      expect(result[0].globs).toEqual(['applet/**/*.vue'])
    })

    it('should convert globs starting with * to **/ format', () => {
      const rules = [createMockRulePrompt('uniapp3', ['*.vue'])]
      const projectConfig: ProjectConfig = {
        rules: {subSeries: {applet: ['uniapp3']}}
      }
      const result = applySubSeriesGlobPrefix(rules, projectConfig)
      expect(result[0].globs).toEqual(['applet/**/*.vue'])
    })

    it('should handle globs with path prefix', () => {
      const rules = [createMockRulePrompt('uniapp3', ['src/**/*.ts'])]
      const projectConfig: ProjectConfig = {
        rules: {subSeries: {applet: ['uniapp3']}}
      }
      const result = applySubSeriesGlobPrefix(rules, projectConfig)
      expect(result[0].globs).toEqual(['applet/src/**/*.ts'])
    })
  })

  describe('duplicate prefix prevention', () => {
    it('should skip adding prefix when glob already has it', () => {
      const rules = [createMockRulePrompt('uniapp3', ['applet/**/*.vue'])]
      const projectConfig: ProjectConfig = {
        rules: {subSeries: {applet: ['uniapp3']}}
      }
      const result = applySubSeriesGlobPrefix(rules, projectConfig)
      expect(result[0].globs).toEqual(['applet/**/*.vue'])
    })

    it('should add only missing prefix when multiple subdirs configured', () => {
      const rules = [createMockRulePrompt('uniapp3', ['applet/**/*.vue'])]
      const projectConfig: ProjectConfig = {
        rules: {subSeries: {applet: ['uniapp3'], example_applet: ['uniapp3']}}
      }
      const result = applySubSeriesGlobPrefix(rules, projectConfig)
      expect(result[0].globs).toEqual(['applet/**/*.vue', 'example_applet/**/*.vue'])
    })
  })

  describe('subdir path normalization', () => {
    it('should normalize subdir path with trailing slash', () => {
      const rules = [createMockRulePrompt('uniapp3', ['**/*.vue'])]
      const projectConfig: ProjectConfig = {
        rules: {subSeries: {'applet/': ['uniapp3']}}
      }
      const result = applySubSeriesGlobPrefix(rules, projectConfig)
      expect(result[0].globs).toEqual(['applet/**/*.vue'])
    })

    it('should normalize subdir path with ./ prefix', () => {
      const rules = [createMockRulePrompt('uniapp3', ['**/*.vue'])]
      const projectConfig: ProjectConfig = {
        rules: {subSeries: {'./applet': ['uniapp3']}}
      }
      const result = applySubSeriesGlobPrefix(rules, projectConfig)
      expect(result[0].globs).toEqual(['applet/**/*.vue'])
    })

    it('should handle nested subdir paths', () => {
      const rules = [createMockRulePrompt('vue', ['**/*.vue'])]
      const projectConfig: ProjectConfig = {
        rules: {subSeries: {'frontend/apps': ['vue']}}
      }
      const result = applySubSeriesGlobPrefix(rules, projectConfig)
      expect(result[0].globs).toEqual(['frontend/apps/**/*.vue'])
    })
  })

  describe('edge cases', () => {
    it('should handle empty rules array', () => {
      const projectConfig: ProjectConfig = {
        rules: {subSeries: {applet: ['uniapp3']}}
      }
      const result = applySubSeriesGlobPrefix([], projectConfig)
      expect(result).toHaveLength(0)
    })

    it('should handle multiple rules with different seriNames', () => {
      const rules = [
        createMockRulePrompt('uniapp3', ['**/*.vue']),
        createMockRulePrompt('vue', ['**/*.ts']),
        createMockRulePrompt(void 0, ['**/*.js'])
      ]
      const projectConfig: ProjectConfig = {
        rules: {subSeries: {applet: ['uniapp3'], example_applet: ['uniapp3', 'vue']}}
      }
      const result = applySubSeriesGlobPrefix(rules, projectConfig)
      expect(result[0].globs).toEqual(['applet/**/*.vue', 'example_applet/**/*.vue'])
      expect(result[1].globs).toEqual(['example_applet/**/*.ts'])
      expect(result[2].globs).toEqual(['**/*.js'])
    })
  })
})
