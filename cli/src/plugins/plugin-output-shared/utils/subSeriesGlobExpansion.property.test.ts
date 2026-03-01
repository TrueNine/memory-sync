/** Property 3: SubSeries glob expansion. Validates: Requirements 5.1, 5.2, 5.3 */
import type {RulePrompt} from '@truenine/plugin-shared'
import type {ProjectConfig} from '@truenine/plugin-shared/types'
import {FilePathKind, PromptKind} from '@truenine/plugin-shared'
import * as fc from 'fast-check'
import {describe, expect, it} from 'vitest'

import {applySubSeriesGlobPrefix} from './ruleFilter'

const seriesNameArb = fc.string({minLength: 1, maxLength: 20, unit: 'grapheme-ascii'})
  .filter(s => /^[\w-]+$/.test(s) && !['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty'].includes(s))

const seriNameArb: fc.Arbitrary<string | string[] | null | undefined> = fc.oneof(
  fc.constant(null),
  fc.constant(void 0),
  seriesNameArb,
  fc.array(seriesNameArb, {minLength: 0, maxLength: 5})
)

const globGen = fc.stringMatching(/^\*\*\/\*\.[a-z]{1,5}$/)
const globArrayGen = fc.array(globGen, {minLength: 1, maxLength: 5})
const subdirGen = fc.stringMatching(/^[a-z][a-z0-9/-]{0,30}$/)
  .filter(s => !s.endsWith('/') && !s.includes('//'))

function createMockRulePrompt(seriName: string | string[] | null | undefined, globs: readonly string[] = ['**/*.ts']): RulePrompt {
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
  } as unknown as RulePrompt
}

describe('property 3: subSeries glob expansion', () => {
  it('rules without seriName have unchanged globs', () => { // **Validates: Requirements 5.2**
    fc.assert(
      fc.property(
        globArrayGen,
        subdirGen,
        fc.array(seriesNameArb, {minLength: 1, maxLength: 3}),
        (globs, subdir, seriNames) => {
          const rule = createMockRulePrompt(null, globs)
          const config: ProjectConfig = {subSeries: {[subdir]: seriNames}}
          const result = applySubSeriesGlobPrefix([rule], config)
          expect(result).toHaveLength(1)
          expect(result[0]!.globs).toEqual(globs)
        }
      ),
      {numRuns: 200}
    )
  })

  it('rules with undefined seriName have unchanged globs', () => { // **Validates: Requirements 5.2**
    fc.assert(
      fc.property(
        globArrayGen,
        subdirGen,
        fc.array(seriesNameArb, {minLength: 1, maxLength: 3}),
        (globs, subdir, seriNames) => {
          const rule = createMockRulePrompt(void 0, globs)
          const config: ProjectConfig = {subSeries: {[subdir]: seriNames}}
          const result = applySubSeriesGlobPrefix([rule], config)
          expect(result).toHaveLength(1)
          expect(result[0]!.globs).toEqual(globs)
        }
      ),
      {numRuns: 200}
    )
  })

  it('string seriName matching subSeries expands globs with subdir prefix', () => { // **Validates: Requirements 5.1**
    fc.assert(
      fc.property(
        seriesNameArb,
        globArrayGen,
        subdirGen,
        (seriName, globs, subdir) => {
          const rule = createMockRulePrompt(seriName, globs)
          const config: ProjectConfig = {subSeries: {[subdir]: [seriName]}}
          const result = applySubSeriesGlobPrefix([rule], config)
          expect(result).toHaveLength(1)
          const resultGlobs = result[0]!.globs
          for (const g of resultGlobs) expect(g).toContain(subdir) // every expanded glob contains the subdir prefix
        }
      ),
      {numRuns: 200}
    )
  })

  it('array seriName matching subSeries expands globs for all matching subdirs', () => { // **Validates: Requirements 5.1, 5.3**
    fc.assert(
      fc.property(
        seriesNameArb,
        globArrayGen,
        fc.array(subdirGen, {minLength: 2, maxLength: 4}).filter(arr => new Set(arr).size === arr.length),
        (seriName, globs, subdirs) => {
          const rule = createMockRulePrompt([seriName], globs)
          const subSeries: Record<string, string[]> = {} // each subdir maps to the same seriName
          for (const sd of subdirs) subSeries[sd] = [seriName]
          const config: ProjectConfig = {subSeries}
          const result = applySubSeriesGlobPrefix([rule], config)
          expect(result).toHaveLength(1)
          const resultGlobs = result[0]!.globs
          for (const sd of subdirs) expect(resultGlobs.some(g => g.includes(sd))).toBe(true) // every subdir appears in at least one expanded glob
        }
      ),
      {numRuns: 200}
    )
  })

  it('non-matching seriName leaves globs unchanged', () => { // **Validates: Requirements 5.2**
    fc.assert(
      fc.property(
        seriesNameArb,
        seriesNameArb,
        globArrayGen,
        subdirGen,
        (ruleSeriName, subSeriesSeriName, globs, subdir) => {
          fc.pre(ruleSeriName !== subSeriesSeriName)
          const rule = createMockRulePrompt(ruleSeriName, globs)
          const config: ProjectConfig = {subSeries: {[subdir]: [subSeriesSeriName]}}
          const result = applySubSeriesGlobPrefix([rule], config)
          expect(result).toHaveLength(1)
          expect(result[0]!.globs).toEqual(globs)
        }
      ),
      {numRuns: 200}
    )
  })

  it('rule count is preserved', () => { // **Validates: Requirements 5.1, 5.2, 5.3**
    fc.assert(
      fc.property(
        fc.array(fc.tuple(seriNameArb, globArrayGen), {minLength: 0, maxLength: 10}),
        subdirGen,
        fc.array(seriesNameArb, {minLength: 1, maxLength: 3}),
        (ruleSpecs, subdir, seriNames) => {
          const rules = ruleSpecs.map(([sn, gl]) => createMockRulePrompt(sn, gl))
          const config: ProjectConfig = {subSeries: {[subdir]: seriNames}}
          const result = applySubSeriesGlobPrefix(rules, config)
          expect(result).toHaveLength(rules.length)
        }
      ),
      {numRuns: 200}
    )
  })

  it('deterministic: same input produces same output', () => { // **Validates: Requirements 5.1, 5.2, 5.3**
    fc.assert(
      fc.property(
        seriNameArb,
        globArrayGen,
        subdirGen,
        fc.array(seriesNameArb, {minLength: 1, maxLength: 3}),
        (seriName, globs, subdir, seriNames) => {
          const rules = [createMockRulePrompt(seriName, globs)]
          const config: ProjectConfig = {subSeries: {[subdir]: seriNames}}
          const result1 = applySubSeriesGlobPrefix(rules, config)
          const result2 = applySubSeriesGlobPrefix(rules, config)
          expect(result1).toEqual(result2)
        }
      ),
      {numRuns: 200}
    )
  })

  it('at least one glob per matched subdir when matched', () => { // **Validates: Requirements 5.1, 5.3**
    fc.assert(
      fc.property(
        seriesNameArb,
        globArrayGen,
        fc.array(subdirGen, {minLength: 1, maxLength: 4}).filter(arr => new Set(arr).size === arr.length),
        (seriName, globs, subdirs) => {
          const rule = createMockRulePrompt(seriName, globs)
          const subSeries: Record<string, string[]> = {}
          for (const sd of subdirs) subSeries[sd] = [seriName]
          const config: ProjectConfig = {subSeries}
          const result = applySubSeriesGlobPrefix([rule], config)
          expect(result).toHaveLength(1)
          const resultGlobs = result[0]!.globs
          expect(resultGlobs.length).toBeGreaterThanOrEqual(subdirs.length) // at least as many globs as unique matched subdirs
        }
      ),
      {numRuns: 200}
    )
  })
})
