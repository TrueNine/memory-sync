import type {InputPluginContext} from '@truenine/plugin-shared'
import * as fs from 'node:fs'
import {createLogger} from '@truenine/plugin-shared'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {GitExcludeInputPlugin} from './GitExcludeInputPlugin'

vi.mock('node:fs')

const BASE_OPTIONS = {
  workspaceDir: '/workspace',
  shadowSourceProject: {
    name: 'aindex',
    skill: {src: 'src/skills', dist: 'dist/skills'},
    fastCommand: {src: 'src/commands', dist: 'dist/commands'},
    subAgent: {src: 'src/agents', dist: 'dist/agents'},
    rule: {src: 'src/rules', dist: 'dist/rules'},
    globalMemory: {src: 'app/global.cn.mdx', dist: 'dist/global.mdx'},
    workspaceMemory: {src: 'app/workspace.cn.mdx', dist: 'dist/app/workspace.mdx'},
    project: {src: 'app', dist: 'dist/app'}
  },
  logLevel: 'debug'
}

describe('gitExcludeInputPlugin', () => {
  beforeEach(() => vi.clearAllMocks())

  it('should collect exclude content from file if it exists', () => {
    const plugin = new GitExcludeInputPlugin()
    const ctx = {
      logger: createLogger('test', 'debug'),
      fs,
      userConfigOptions: BASE_OPTIONS
    } as unknown as InputPluginContext

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue('.idea/\n*.log')

    const result = plugin.collect(ctx)

    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringMatching(/public[/\\]exclude/), 'utf8')
    expect(result).toEqual({
      shadowGitExclude: '.idea/\n*.log'
    })
  })

  it('should return empty object if file does not exist', () => {
    const plugin = new GitExcludeInputPlugin()
    const ctx = {
      logger: createLogger('test', 'debug'),
      fs,
      userConfigOptions: BASE_OPTIONS
    } as unknown as InputPluginContext

    vi.mocked(fs.existsSync).mockReturnValue(false)

    const result = plugin.collect(ctx)

    expect(fs.existsSync).toHaveBeenCalledWith(expect.stringMatching(/public[/\\]exclude/))
    expect(fs.readFileSync).not.toHaveBeenCalled()
    expect(result).toEqual({})
  })

  it('should return empty object if file is empty', () => {
    const plugin = new GitExcludeInputPlugin()
    const ctx = {
      logger: createLogger('test', 'debug'),
      fs,
      userConfigOptions: BASE_OPTIONS
    } as unknown as InputPluginContext

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue('')

    const result = plugin.collect(ctx)

    expect(result).toEqual({})
  })
})
