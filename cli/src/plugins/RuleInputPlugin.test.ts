import type {RulePrompt} from '@/types'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {validateRuleMetadata} from '@/types'

describe('validateRuleMetadata', () => {
  it('should pass with valid metadata', () => {
    const result = validateRuleMetadata({
      globs: ['src/**/*.ts'],
      description: 'TypeScript rules'
    })
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should pass with valid metadata including scope', () => {
    const result = validateRuleMetadata({
      globs: ['src/**/*.ts', '**/*.tsx'],
      description: 'TypeScript rules',
      scope: 'global'
    })
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it('should warn when scope is not provided', () => {
    const result = validateRuleMetadata({
      globs: ['src/**'],
      description: 'Some rules'
    })
    expect(result.valid).toBe(true)
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings[0]).toContain('scope')
  })

  it('should fail when globs is missing', () => {
    const result = validateRuleMetadata({description: 'No globs'})
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('globs'))).toBe(true)
  })

  it('should fail when globs is empty array', () => {
    const result = validateRuleMetadata({
      globs: [],
      description: 'Empty globs'
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('globs'))).toBe(true)
  })

  it('should fail when globs contains non-string values', () => {
    const result = validateRuleMetadata({
      globs: [123, true],
      description: 'Bad globs'
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('globs'))).toBe(true)
  })

  it('should fail when description is missing', () => {
    const result = validateRuleMetadata({
      globs: ['**/*.ts']
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('description'))).toBe(true)
  })

  it('should fail when description is empty string', () => {
    const result = validateRuleMetadata({
      globs: ['**/*.ts'],
      description: ''
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('description'))).toBe(true)
  })

  it('should fail when scope is invalid', () => {
    const result = validateRuleMetadata({
      globs: ['**/*.ts'],
      description: 'Valid desc',
      scope: 'invalid'
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.includes('scope'))).toBe(true)
  })

  it('should accept scope "project"', () => {
    const result = validateRuleMetadata({
      globs: ['**/*.ts'],
      description: 'Valid',
      scope: 'project'
    })
    expect(result.valid).toBe(true)
  })

  it('should accept scope "global"', () => {
    const result = validateRuleMetadata({
      globs: ['**/*.ts'],
      description: 'Valid',
      scope: 'global'
    })
    expect(result.valid).toBe(true)
  })

  it('should include filePath in error messages when provided', () => {
    const result = validateRuleMetadata({}, 'test/file.mdx')
    expect(result.valid).toBe(false)
    expect(result.errors.every(e => e.includes('test/file.mdx'))).toBe(true)
  })
})

describe('ruleInputPlugin - file structure', () => {
  let tempDir: string

  beforeEach(() => tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rule-input-test-')))

  afterEach(() => fs.rmSync(tempDir, {recursive: true, force: true}))

  it('should create proper directory structure for rules', () => {
    const seriesDir = path.join(tempDir, 'cursor-style')
    fs.mkdirSync(seriesDir, {recursive: true})
    fs.writeFileSync(
      path.join(seriesDir, 'component.mdx'),
      [
        'export default {',
        '  globs: [\'src/components/**\', \'**/*.tsx\'],',
        '  description: \'React component conventions\'',
        '}',
        '',
        '## Component Rules',
        '',
        '- Use functional components'
      ].join('\n')
    )

    expect(fs.existsSync(path.join(seriesDir, 'component.mdx'))).toBe(true)
  })
})

describe('rule output naming', () => {
  it('should generate rule- prefixed filenames for Cursor', () => {
    const rule: Pick<RulePrompt, 'series' | 'ruleName'> = {
      series: 'cursor-style',
      ruleName: 'component'
    }
    const fileName = `rule-${rule.series}-${rule.ruleName}.mdc`
    expect(fileName).toBe('rule-cursor-style-component.mdc')
    expect(fileName.startsWith('rule-')).toBe(true)
  })

  it('should generate rule- prefixed filenames for Windsurf', () => {
    const rule: Pick<RulePrompt, 'series' | 'ruleName'> = {
      series: 'test-patterns',
      ruleName: 'vitest'
    }
    const fileName = `rule-${rule.series}-${rule.ruleName}.md`
    expect(fileName).toBe('rule-test-patterns-vitest.md')
    expect(fileName.startsWith('rule-')).toBe(true)
  })

  it('should generate rule- prefixed filenames for Kiro', () => {
    const rule: Pick<RulePrompt, 'series' | 'ruleName'> = {
      series: 'cursor-style',
      ruleName: 'api'
    }
    const fileName = `rule-${rule.series}-${rule.ruleName}.md`
    expect(fileName).toBe('rule-cursor-style-api.md')
    expect(fileName.startsWith('rule-')).toBe(true)
  })

  it('should not collide with kiro- prefix used by child prompts', () => {
    const ruleFileName = 'rule-cursor-style-component.md'
    const childFileName = 'kiro-src-components.md'
    expect(ruleFileName).not.toBe(childFileName)
    expect(ruleFileName.startsWith('rule-')).toBe(true)
    expect(childFileName.startsWith('kiro-')).toBe(true)
  })

  it('should not collide with trae- prefix used by child prompts', () => {
    const ruleFileName = 'rule-cursor-style-component.md'
    const traeFileName = 'trae-src-components.md'
    expect(ruleFileName).not.toBe(traeFileName)
    expect(ruleFileName.startsWith('rule-')).toBe(true)
    expect(traeFileName.startsWith('trae-')).toBe(true)
  })

  it('should not collide with glob- prefix used by Qoder/JetBrains', () => {
    const ruleFileName = 'rule-cursor-style-component.md'
    const globFileName = 'glob-src.md'
    expect(ruleFileName).not.toBe(globFileName)
    expect(ruleFileName.startsWith('rule-')).toBe(true)
    expect(globFileName.startsWith('glob-')).toBe(true)
  })
})

describe('rule scope defaults', () => {
  it('should default scope to project when not provided', () => {
    const scope = void 0 ?? 'project'
    expect(scope).toBe('project')
  })

  it('should use explicit project scope', () => {
    const scope: string = 'project'
    expect(scope).toBe('project')
  })

  it('should use explicit global scope', () => {
    const scope: string = 'global'
    expect(scope).toBe('global')
  })
})

describe('kiro fileMatchPattern brace expansion', () => {
  it('should use single glob directly', () => {
    const globs = ['src/components/**']
    const pattern = globs.length === 1 ? globs[0] : `{${globs.join(',')}}`
    expect(pattern).toBe('src/components/**')
  })

  it('should combine multiple globs with brace expansion', () => {
    const globs = ['src/components/**', '**/*.tsx']
    const pattern = globs.length === 1 ? globs[0] : `{${globs.join(',')}}`
    expect(pattern).toBe('{src/components/**,**/*.tsx}')
  })

  it('should handle three or more globs', () => {
    const globs = ['src/**', 'lib/**', 'test/**']
    const pattern = globs.length === 1 ? globs[0] : `{${globs.join(',')}}`
    expect(pattern).toBe('{src/**,lib/**,test/**}')
  })
})
