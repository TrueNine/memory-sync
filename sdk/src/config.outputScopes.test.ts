import {describe, expect, it} from 'vitest'
import {mergeConfig} from './config'

describe('mergeConfig outputScopes', () => {
  it('merges plugin topic overrides deeply', () => {
    const merged = mergeConfig(
      {
        outputScopes: {
          plugins: {
            CursorOutputPlugin: {
              commands: 'global',
              skills: ['workspace', 'global']
            }
          }
        }
      },
      {
        outputScopes: {
          plugins: {
            CursorOutputPlugin: {
              rules: 'project',
              skills: 'project'
            },
            OpencodeCLIOutputPlugin: {
              mcp: 'global'
            }
          }
        }
      }
    )

    expect(merged.outputScopes).toEqual({
      plugins: {
        CursorOutputPlugin: {
          commands: 'global',
          skills: 'project',
          rules: 'project'
        },
        OpencodeCLIOutputPlugin: {
          mcp: 'global'
        }
      }
    })
  })
})
