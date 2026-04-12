import {describe, expect, it} from 'vitest'
import {buildPromptTomlArtifact, buildTomlDocument} from './toml'

describe('toml', () => {
  describe('buildTomlDocument', () => {
    it('renders root keys before nested tables', () => {
      const result = buildTomlDocument({
        name: 'reviewer',
        description: 'Checks patches',
        mcp_servers: {
          docs: {
            command: 'node',
            args: ['mcp.js']
          }
        }
      }, {
        fieldOrder: ['name', 'description']
      })

      expect(result).toBe([
        'name = "reviewer"',
        'description = "Checks patches"',
        '',
        '[mcp_servers]',
        '',
        '[mcp_servers.docs]',
        'args = ["mcp.js"]',
        'command = "node"'
      ].join('\n'))
    })

    it('renders arrays of tables', () => {
      const result = buildTomlDocument({
        reviewers: [
          {name: 'alpha', enabled: true},
          {name: 'beta', enabled: false}
        ]
      })

      expect(result).toBe([
        '[[reviewers]]',
        'name = "alpha"',
        'enabled = true',
        '',
        '[[reviewers]]',
        'name = "beta"',
        'enabled = false'
      ].join('\n'))
    })

    it('keeps nested tables scoped under array-of-table parents', () => {
      const result = buildTomlDocument({
        reviewers: [
          {
            name: 'alpha',
            policy: {
              mode: 'strict'
            }
          }
        ]
      })

      expect(result).toBe([
        '[[reviewers]]',
        'name = "alpha"',
        '',
        '[reviewers.policy]',
        'mode = "strict"'
      ].join('\n'))
    })

    it('renders multiline strings with triple quotes', () => {
      const result = buildTomlDocument({
        developer_instructions: 'Review changes carefully.\nFocus on concrete regressions.'
      })

      expect(result).toBe([
        'developer_instructions = """',
        'Review changes carefully.',
        'Focus on concrete regressions."""'
      ].join('\n'))
    })
  })

  describe('buildPromptTomlArtifact', () => {
    it('maps prompt front matter into a TOML artifact and excludes internal keys', () => {
      const result = buildPromptTomlArtifact({
        content: 'Review changes carefully.\nReport concrete bugs only.',
        bodyFieldName: 'developer_instructions',
        fieldOrder: ['name', 'description', 'developer_instructions'],
        excludedKeys: ['scope', 'seriName', 'allowTools', 'argumentHint', 'color', 'namingCase'],
        frontMatter: {
          name: 'reviewer',
          description: 'Review patches',
          scope: 'global',
          nickname_candidates: ['guard', 'critic'],
          sandbox_mode: 'workspace-write',
          allowTools: ['shell'],
          skills: {
            config: {
              web_search: true
            }
          }
        }
      })

      expect(result).toContain('name = "reviewer"')
      expect(result).toContain('description = "Review patches"')
      expect(result).toContain([
        'developer_instructions = """',
        'Review changes carefully.',
        'Report concrete bugs only."""'
      ].join('\n'))
      expect(result).toContain('nickname_candidates = ["guard", "critic"]')
      expect(result).toContain('sandbox_mode = "workspace-write"')
      expect(result).toContain('[skills]')
      expect(result).toContain('[skills.config]')
      expect(result).not.toContain('scope = ')
      expect(result).not.toContain('allowTools')
    })
  })
})
