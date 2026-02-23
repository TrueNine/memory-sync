/** Property 6: Type-specific filters use correct config sections. Validates: Requirements 7.1, 7.2, 7.3, 7.4 */
import type {FastCommandPrompt, RulePrompt, SkillPrompt, SubAgentPrompt} from '@truenine/plugin-shared'
import type {ProjectConfig} from '@truenine/plugin-shared/types'
import * as fc from 'fast-check'
import {describe, expect, it} from 'vitest'

import {filterCommandsByProjectConfig} from './commandFilter'
import {filterRulesByProjectConfig} from './ruleFilter'
import {matchesSeries, resolveEffectiveIncludeSeries} from './seriesFilter'
import {filterSkillsByProjectConfig} from './skillFilter'
import {filterSubAgentsByProjectConfig} from './subAgentFilter'

const seriesNameArb = fc.string({minLength: 1, maxLength: 20, unit: 'grapheme-ascii'})
  .filter(s => /^[\w-]+$/.test(s) && !['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty'].includes(s))

const seriNameArb: fc.Arbitrary<string | string[] | null | undefined> = fc.oneof(
  fc.constant(null),
  fc.constant(void 0),
  seriesNameArb,
  fc.array(seriesNameArb, {minLength: 0, maxLength: 5})
)

const optionalSeriesArb = fc.option(fc.array(seriesNameArb, {minLength: 0, maxLength: 10}), {nil: void 0})

const typeSeriesConfigArb = fc.record({
  includeSeries: optionalSeriesArb
})

const projectConfigArb: fc.Arbitrary<ProjectConfig> = fc.record({
  includeSeries: optionalSeriesArb,
  rules: fc.option(typeSeriesConfigArb, {nil: void 0}),
  skills: fc.option(typeSeriesConfigArb, {nil: void 0}),
  subAgents: fc.option(typeSeriesConfigArb, {nil: void 0}),
  commands: fc.option(typeSeriesConfigArb, {nil: void 0})
})

function makeSkill(seriName: string | string[] | null | undefined): SkillPrompt {
  return {seriName} as unknown as SkillPrompt
}

function makeRule(seriName: string | string[] | null | undefined): RulePrompt {
  return {seriName, globs: [], scope: 'project', series: '', ruleName: '', type: 'Rule'} as unknown as RulePrompt
}

function makeSubAgent(seriName: string | string[] | null | undefined): SubAgentPrompt {
  return {seriName, agentName: '', type: 'SubAgent'} as unknown as SubAgentPrompt
}

function makeCommand(seriName: string | string[] | null | undefined): FastCommandPrompt {
  return {seriName, commandName: '', type: 'FastCommand'} as unknown as FastCommandPrompt
}

describe('property 6: type-specific filters use correct config sections', () => {
  it('filterSkillsByProjectConfig matches manual filtering with skills includeSeries', () => { // **Validates: Requirement 7.1**
    fc.assert(
      fc.property(
        projectConfigArb,
        fc.array(seriNameArb, {minLength: 0, maxLength: 10}),
        (config, seriNames) => {
          const skills = seriNames.map(makeSkill)
          const filtered = filterSkillsByProjectConfig(skills, config)
          const effectiveSeries = resolveEffectiveIncludeSeries(config.includeSeries, config.skills?.includeSeries)
          const expected = skills.filter(s => matchesSeries(s.seriName, effectiveSeries))
          expect(filtered).toEqual(expected)
        }
      ),
      {numRuns: 200}
    )
  })

  it('filterRulesByProjectConfig matches manual filtering with rules includeSeries', () => { // **Validates: Requirement 7.2**
    fc.assert(
      fc.property(
        projectConfigArb,
        fc.array(seriNameArb, {minLength: 0, maxLength: 10}),
        (config, seriNames) => {
          const rules = seriNames.map(makeRule)
          const filtered = filterRulesByProjectConfig(rules, config)
          const effectiveSeries = resolveEffectiveIncludeSeries(config.includeSeries, config.rules?.includeSeries)
          const expected = rules.filter(r => matchesSeries(r.seriName, effectiveSeries))
          expect(filtered).toEqual(expected)
        }
      ),
      {numRuns: 200}
    )
  })

  it('filterSubAgentsByProjectConfig matches manual filtering with subAgents includeSeries', () => { // **Validates: Requirement 7.3**
    fc.assert(
      fc.property(
        projectConfigArb,
        fc.array(seriNameArb, {minLength: 0, maxLength: 10}),
        (config, seriNames) => {
          const subAgents = seriNames.map(makeSubAgent)
          const filtered = filterSubAgentsByProjectConfig(subAgents, config)
          const effectiveSeries = resolveEffectiveIncludeSeries(config.includeSeries, config.subAgents?.includeSeries)
          const expected = subAgents.filter(sa => matchesSeries(sa.seriName, effectiveSeries))
          expect(filtered).toEqual(expected)
        }
      ),
      {numRuns: 200}
    )
  })

  it('filterCommandsByProjectConfig matches manual filtering with commands includeSeries', () => { // **Validates: Requirement 7.4**
    fc.assert(
      fc.property(
        projectConfigArb,
        fc.array(seriNameArb, {minLength: 0, maxLength: 10}),
        (config, seriNames) => {
          const commands = seriNames.map(makeCommand)
          const filtered = filterCommandsByProjectConfig(commands, config)
          const effectiveSeries = resolveEffectiveIncludeSeries(config.includeSeries, config.commands?.includeSeries)
          const expected = commands.filter(c => matchesSeries(c.seriName, effectiveSeries))
          expect(filtered).toEqual(expected)
        }
      ),
      {numRuns: 200}
    )
  })
})
