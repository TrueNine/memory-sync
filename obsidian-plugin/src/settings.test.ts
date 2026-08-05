import {describe, expect, it} from 'bun:test'

import {DEFAULT_SETTINGS, normalizeSettings, parseScopeText} from './settings'

describe('TNMSO settings', () => {
  it('defaults compiled preview to enabled', () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  })

  it('keeps only valid persisted values', () => {
    expect(normalizeSettings({compiledPreviewEnabled: false, scope: {profile: {name: 'User'}}})).toEqual({
      compiledPreviewEnabled: false,
      scope: {profile: {name: 'User'}},
    })
    expect(normalizeSettings({compiledPreviewEnabled: 'no', scope: []})).toEqual(DEFAULT_SETTINGS)
  })

  it('parses object scope without accepting arrays or invalid JSON', () => {
    expect(parseScopeText('{"tool":{"name":"TNMSO"}}')).toEqual({
      ok: true,
      scope: {tool: {name: 'TNMSO'}},
    })
    expect(parseScopeText('[]')).toMatchObject({ok: false})
    expect(parseScopeText('{')).toMatchObject({ok: false})
  })
})
