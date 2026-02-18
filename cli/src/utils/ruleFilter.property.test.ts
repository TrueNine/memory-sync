import type {ProjectConfig} from '@/types/ConfigTypes'
import type {RulePrompt} from '@/types/InputTypes'
import * as fc from 'fast-check'
import {describe, expect, it} from 'vitest'
import {FilePathKind, PromptKind} from '@/types'
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

const seriNameGen = fc.stringMatching(/^[a-z0-9]{1,20}$/)
const seriNameArrayGen = fc.array(seriNameGen, {minLength: 0, maxLength: 10})
const globGen = fc.stringMatching(/^\*\*\/\*\.[a-z]{1,5}$/)
const globArrayGen = fc.array(globGen, {minLength: 1, maxLength: 5})

const subdirGen = fc.stringMatching(/^[a-z][a-z0-9/-]{0,30}$/)
const subSeriesGen = fc.dictionary(subdirGen, seriNameArrayGen)

describe('filterRulesByProjectConfig property tests', () => {
  it('should return all rules when projectConfig is undefined', async () => {
    await fc.assert(
      fc.asyncProperty(seriNameArrayGen, async seriNames => {
        const rules = seriNames.map(name => createMockRulePrompt(name))
        const result = filterRulesByProjectConfig(rules, void 0)
        expect(result).toHaveLength(rules.length)
      }),
      {numRuns: 100}
    )
  })

  it('should filter rules deterministically', async () => {
    await fc.assert(
      fc.asyncProperty(
        seriNameArrayGen,
        seriNameArrayGen,
        seriNameArrayGen,
        async (ruleNames, includeNames, excludeNames) => {
          const rules = ruleNames.map(name => createMockRulePrompt(name))
          const projectConfig: ProjectConfig = {
            rules: {include: includeNames, exclude: excludeNames}
          }
          const result1 = filterRulesByProjectConfig(rules, projectConfig)
          const result2 = filterRulesByProjectConfig(rules, projectConfig)
          expect(result1).toEqual(result2)
        }
      ),
      {numRuns: 100}
    )
  })

  it('should return subset when include is specified', async () => {
    await fc.assert(
      fc.asyncProperty(
        seriNameArrayGen,
        seriNameArrayGen,
        async (ruleNames, includeNames) => {
          const rules = ruleNames.map(name => createMockRulePrompt(name))
          const projectConfig: ProjectConfig = {
            rules: {include: includeNames}
          }
          const result = filterRulesByProjectConfig(rules, projectConfig)
          expect(result.length).toBeLessThanOrEqual(rules.length)
        }
      ),
      {numRuns: 100}
    )
  })

  it('should never return rules with excluded seriName', async () => {
    await fc.assert(
      fc.asyncProperty(
        seriNameArrayGen,
        seriNameArrayGen,
        async (ruleNames, excludeNames) => {
          const rules = ruleNames.map(name => createMockRulePrompt(name))
          const projectConfig: ProjectConfig = {
            rules: {exclude: excludeNames}
          }
          const result = filterRulesByProjectConfig(rules, projectConfig)
          for (const excluded of excludeNames) {
            const hasExcluded = result.some(r => r.seriName === excluded)
            expect(hasExcluded).toBe(false)
          }
        }
      ),
      {numRuns: 100}
    )
  })

  it('should always include rules with undefined seriName', async () => {
    await fc.assert(
      fc.asyncProperty(
        seriNameArrayGen,
        seriNameArrayGen,
        seriNameArrayGen,
        async (definedNames, includeNames, excludeNames) => {
          const rules = [
            ...definedNames.map(name => createMockRulePrompt(name)),
            createMockRulePrompt(void 0)
          ]
          const projectConfig: ProjectConfig = {
            rules: {include: includeNames, exclude: excludeNames}
          }
          const result = filterRulesByProjectConfig(rules, projectConfig)
          const hasUndefinedSeriName = result.some(r => r.seriName === void 0)
          expect(hasUndefinedSeriName).toBe(true)
        }
      ),
      {numRuns: 100}
    )
  })
})

describe('applySubSeriesGlobPrefix property tests', () => {
  it('should return original rules when no projectConfig', async () => {
    await fc.assert(
      fc.asyncProperty(
        seriNameGen,
        globArrayGen,
        async (seriName, globs) => {
          const rules = [createMockRulePrompt(seriName, globs)]
          const result = applySubSeriesGlobPrefix(rules, void 0)
          expect(result).toEqual(rules)
        }
      ),
      {numRuns: 100}
    )
  })

  it('should return original rules when no subSeries', async () => {
    await fc.assert(
      fc.asyncProperty(
        seriNameGen,
        globArrayGen,
        async (seriName, globs) => {
          const rules = [createMockRulePrompt(seriName, globs)]
          const projectConfig: ProjectConfig = {rules: {include: [seriName]}}
          const result = applySubSeriesGlobPrefix(rules, projectConfig)
          expect(result).toEqual(rules)
        }
      ),
      {numRuns: 100}
    )
  })

  it('should not modify rules with undefined seriName', async () => {
    await fc.assert(
      fc.asyncProperty(
        globArrayGen,
        subSeriesGen,
        async (globs, subSeries) => {
          const rules = [createMockRulePrompt(void 0, globs)]
          const projectConfig: ProjectConfig = {rules: {subSeries}}
          const result = applySubSeriesGlobPrefix(rules, projectConfig)
          expect(result[0].globs).toEqual(globs)
        }
      ),
      {numRuns: 100}
    )
  })

  it('should always produce valid glob patterns', async () => {
    await fc.assert(
      fc.asyncProperty(
        seriNameGen,
        globArrayGen,
        subdirGen,
        async (seriName, globs, subdir) => {
          const rules = [createMockRulePrompt(seriName, globs)]
          const projectConfig: ProjectConfig = {
            rules: {subSeries: {[subdir]: [seriName]}}
          }
          const result = applySubSeriesGlobPrefix(rules, projectConfig)
          for (const glob of result[0].globs) {
            expect(typeof glob).toBe('string')
            expect(glob.length).toBeGreaterThan(0)
          }
        }
      ),
      {numRuns: 100}
    )
  })

  it('should produce same number or more globs when matched', async () => {
    await fc.assert(
      fc.asyncProperty(
        seriNameGen,
        globArrayGen,
        fc.array(subdirGen, {minLength: 1, maxLength: 5}),
        async (seriName, globs, subdirs) => {
          const rules = [createMockRulePrompt(seriName, globs)]
          const subSeries: Record<string, readonly string[]> = {}
          for (const subdir of subdirs) {
            subSeries[subdir] = [seriName]
          }
          const projectConfig: ProjectConfig = {rules: {subSeries}}
          const result = applySubSeriesGlobPrefix(rules, projectConfig)
          expect(result[0].globs.length).toBeGreaterThanOrEqual(globs.length)
        }
      ),
      {numRuns: 100}
    )
  })

  it('should be deterministic', async () => {
    await fc.assert(
      fc.asyncProperty(
        seriNameGen,
        globArrayGen,
        subSeriesGen,
        async (seriName, globs, subSeries) => {
          const rules = [createMockRulePrompt(seriName, globs)]
          const projectConfig: ProjectConfig = {rules: {subSeries}}
          const result1 = applySubSeriesGlobPrefix(rules, projectConfig)
          const result2 = applySubSeriesGlobPrefix(rules, projectConfig)
          expect(result1).toEqual(result2)
        }
      ),
      {numRuns: 100}
    )
  })

  it('should preserve rule count', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(seriNameGen, {minLength: 0, maxLength: 10}),
        globArrayGen,
        subSeriesGen,
        async (seriNames, globs, subSeries) => {
          const rules = seriNames.map(name => createMockRulePrompt(name, globs))
          const projectConfig: ProjectConfig = {rules: {subSeries}}
          const result = applySubSeriesGlobPrefix(rules, projectConfig)
          expect(result).toHaveLength(rules.length)
        }
      ),
      {numRuns: 100}
    )
  })
})
