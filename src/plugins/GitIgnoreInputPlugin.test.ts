import * as path from 'node:path'
import {describe, expect, it, vi} from 'vitest'
import {createLogger} from '@/log'
import {GitIgnoreInputPlugin} from './GitIgnoreInputPlugin'

describe('gitIgnoreInputPlugin', () => {
  it('should collect globalGitIgnore content when file exists', () => {
    const plugin = new GitIgnoreInputPlugin()

    const mockFs = {
      existsSync: vi.fn().mockReturnValue(true),
      readFileSync: vi.fn().mockReturnValue('node_modules/\n.env'),
      statSync: vi.fn(),
    }

    const ctx = { // Mock context
      fs: mockFs,
      path,
      logger: createLogger('test', 'debug'),
      userConfigOptions: {},
    } as unknown as import('@/types').InputPluginContext

    const result = plugin.collect(ctx)

    expect(mockFs.existsSync).toHaveBeenCalled()
    expect(result).toEqual({
      globalGitIgnore: 'node_modules/\n.env',
    })
  })

  it('should return empty object when file does not exist', () => {
    const plugin = new GitIgnoreInputPlugin()

    const mockFs = {
      existsSync: vi.fn().mockReturnValue(false),
      readFileSync: vi.fn(),
    }

    const ctx = {
      fs: mockFs,
      path,
      logger: createLogger('test', 'debug'),
      userConfigOptions: {},
    } as unknown as import('@/types').InputPluginContext

    const result = plugin.collect(ctx)

    expect(mockFs.existsSync).toHaveBeenCalled()
    expect(result).toEqual({})
  })
})
