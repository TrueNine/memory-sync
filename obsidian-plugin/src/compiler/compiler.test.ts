import {describe, expect, it} from 'bun:test'

import {compileMdx} from './compiler'

describe('compileMdx', () => {
  it('preserves ordinary Markdown and GFM', () => {
    const source = '# Prompt\n\n- [x] Keep **Markdown**\n'

    const result = compileMdx(source)

    expect(result.markdown).toContain('# Prompt')
    expect(result.markdown).toContain('- [x] Keep **Markdown**')
    expect(result.diagnostics).toEqual([])
  })

  it('merges scope in settings, YAML, then static export order', () => {
    const source = [
      '---',
      'profile:',
      '  name: YAML',
      '---',
      '',
      'export const profile = { name: "Export" }',
      '',
      'Hello {profile.name} from {tool.name}.',
      '',
    ].join('\n')

    const result = compileMdx(source, {
      profile: {name: 'Settings'},
      tool: {name: 'TNMSO'},
    })

    expect(result.markdown).toContain('Hello Export from TNMSO.')
    expect(result.markdown).not.toContain('export const')
    expect(result.metadata).toMatchObject({profile: {name: 'Export'}})
  })

  it('includes and excludes known Md components using static conditions', () => {
    const source = [
      '<Md when={profile.enabled}>Visible</Md>',
      '',
      '<Md.Line when={false}>Hidden</Md.Line>',
      '',
    ].join('\n')

    const result = compileMdx(source, {profile: {enabled: true}})

    expect(result.markdown).toContain('Visible')
    expect(result.markdown).not.toContain('Hidden')
    expect(result.markdown).not.toContain('<Md')
  })

  it('does not execute calls and preserves unsupported expressions', () => {
    const source = 'Value: {dangerous()}\n'

    const result = compileMdx(source)

    expect(result.markdown).toContain('{dangerous()}')
    expect(result.diagnostics.some(diagnostic => (
      diagnostic.code === 'unsupported-expression' && diagnostic.severity === 'warning'
    ))).toBeTrue()
  })

  it('preserves unknown components and reports a warning', () => {
    const source = '<Unknown value={profile.name}>Body</Unknown>\n'

    const result = compileMdx(source, {profile: {name: 'Example'}})

    expect(result.markdown).toContain('<Unknown')
    expect(result.diagnostics.some(diagnostic => (
      diagnostic.code === 'unknown-component' && diagnostic.severity === 'warning'
    ))).toBeTrue()
  })

  it('fails open when MDX cannot be parsed', () => {
    const source = '<Md when={true}>Unclosed\n'

    const result = compileMdx(source)

    expect(result.markdown).toBe(source)
    expect(result.diagnostics.some(diagnostic => (
      diagnostic.code === 'parse-error' && diagnostic.severity === 'error'
    ))).toBeTrue()
  })
})
