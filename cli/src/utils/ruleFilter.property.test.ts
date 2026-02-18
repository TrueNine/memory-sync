import type {ProjectConfig} from '@/types/ConfigTypes'
import type {RulePrompt} from '@/types/InputTypes'
import * as fc from 'fast-check'
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

const seriNameGen = fc.stringMatching(/^[a-z0-9]{1,20}$/)
const seriNameArrayGen = fc.array(seriNameGen, {minLength: 0, maxLength: 10})

const subSeriesGen = fc.dictionary(seriNameGen, seriNameArrayGen) // Generator for subSeries: Record<string, readonly string[]>

describe('expandWithSubSeries property tests', () => {
  it('should always include all input names in result', () => {
    fc.assert(
      fc.property(seriNameArrayGen, subSeriesGen, (names, subSeries) => {
        const result = expandWithSubSeries(names, subSeries)
        for (const name of names) expect(result).toContain(name)
      }),
      {numRuns: 100}
    )
  })

  it('should never produce duplicates', () => {
    fc.assert(
      fc.property(seriNameArrayGen, subSeriesGen, (names, subSeries) => {
        const result = expandWithSubSeries(names, subSeries)
        const uniqueResult = [...new Set(result)]
        expect(result).toHaveLength(uniqueResult.length)
      }),
      {numRuns: 100}
    )
  })

  it('should be idempotent when subSeries has no matching keys', () => {
    fc.assert(
      fc.property(seriNameArrayGen, names => {
        const emptySubSeries: Record<string, readonly string[]> = {}
        const result1 = expandWithSubSeries(names, emptySubSeries)
        const result2 = expandWithSubSeries(result1, emptySubSeries)
        expect(result1).toEqual(result2)
      }),
      {numRuns: 100}
    )
  })

  it('should expand result size >= unique input size', () => {
    fc.assert(
      fc.property(seriNameArrayGen, subSeriesGen, (names, subSeries) => {
        const result = expandWithSubSeries(names, subSeries)
        const uniqueNames = [...new Set(names)]
        expect(result.length).toBeGreaterThanOrEqual(uniqueNames.length)
      }),
      {numRuns: 100}
    )
  })
})

describe('filterRulesByProjectConfig property tests', () => {
  it('should return all rules when projectConfig is undefined', async () => {
    await fc.assert(
      fc.asyncProperty(seriNameArrayGen, async seriNames => {
        const rules = seriNames.map(createMockRulePrompt)
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
          const rules = ruleNames.map(createMockRulePrompt)
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
          const rules = ruleNames.map(createMockRulePrompt)
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
          const rules = ruleNames.map(createMockRulePrompt)
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
            ...definedNames.map(createMockRulePrompt),
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

  it('subSeries expansion should include parent and children', async () => {
    const parentGen = seriNameGen
    const childrenGen = fc.array(seriNameGen, {minLength: 1, maxLength: 5})

    await fc.assert(
      fc.asyncProperty(parentGen, childrenGen, async (parent, children) => {
        const rules = [parent, ...children].map(createMockRulePrompt)
        const projectConfig: ProjectConfig = {
          rules: {
            include: [parent],
            subSeries: {[parent]: children}
          }
        }
        const result = filterRulesByProjectConfig(rules, projectConfig)
        expect(result.map(r => r.seriName)).toContain(parent)
        for (const child of children) expect(result.map(r => r.seriName)).toContain(child)
      }),
      {numRuns: 100}
    )
  })
})
