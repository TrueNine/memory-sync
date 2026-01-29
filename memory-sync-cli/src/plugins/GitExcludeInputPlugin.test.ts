import type {InputPluginContext} from '@/types'
import * as fs from 'node:fs'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {createLogger} from '@/log'
import {GitExcludeInputPlugin} from './GitExcludeInputPlugin'

vi.mock('node:fs')

describe('gitExcludeInputPlugin', () => {
  beforeEach(() => vi.clearAllMocks())

  it('should collect exclude content from file if it exists', () => {
    const plugin = new GitExcludeInputPlugin()
    const ctx = {
      logger: createLogger('test', 'debug'),
      userConfigOptions: {
        workspaceDir: '/workspace',
        shadowSourceProjectDir: '/workspace',
        shadowSkillSourceDir: '/workspace/.skills',
        shadowFastCommandDir: '/workspace/.claude/commands',
        shadowSubAgentDir: '/workspace/.claude/agents',
        globalMemoryFile: '/workspace/GLOBAL.md',
        shadowProjectsDir: '/workspace',
        logLevel: 'debug'
      }
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
      userConfigOptions: {
        workspaceDir: '/workspace',
        shadowSourceProjectDir: '/workspace',
        shadowSkillSourceDir: '/workspace/.skills',
        shadowFastCommandDir: '/workspace/.claude/commands',
        shadowSubAgentDir: '/workspace/.claude/agents',
        globalMemoryFile: '/workspace/GLOBAL.md',
        shadowProjectsDir: '/workspace',
        logLevel: 'debug'
      }
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
      userConfigOptions: {
        workspaceDir: '/workspace',
        shadowSourceProjectDir: '/workspace',
        shadowSkillSourceDir: '/workspace/.skills',
        shadowFastCommandDir: '/workspace/.claude/commands',
        shadowSubAgentDir: '/workspace/.claude/agents',
        globalMemoryFile: '/workspace/GLOBAL.md',
        shadowProjectsDir: '/workspace',
        logLevel: 'debug'
      }
    } as unknown as InputPluginContext

    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue('')

    const result = plugin.collect(ctx)

    expect(result).toEqual({})
  })
})
