import type {InputPluginContext} from '@/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {createLogger} from '@/log'
import {GitIgnoreInputPlugin} from './GitIgnoreInputPlugin'

vi.mock('node:fs')

describe('gitIgnoreInputPlugin', () => {
  beforeEach(() => vi.clearAllMocks())

  it('should collect gitignore content from file if it exists', () => {
    const plugin = new GitIgnoreInputPlugin()
    const ctx = {
      logger: createLogger('test', 'debug'),
      fs,
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
    vi.mocked(fs.readFileSync).mockReturnValue('node_modules/\n.env')

    const result = plugin.collect(ctx)

    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining(path.join('public', 'gitignore')), 'utf8')
    expect(result).toEqual({
      globalGitIgnore: 'node_modules/\n.env'
    })
  })

  it('should fallback to template if file does not exist', () => {
    const plugin = new GitIgnoreInputPlugin()
    const ctx = {
      logger: createLogger('test', 'debug'),
      fs,
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

    expect(fs.existsSync).toHaveBeenCalledWith(expect.stringContaining(path.join('public', 'gitignore')))
    expect(fs.readFileSync).not.toHaveBeenCalled()

    if (typeof __TEMPLATE_GITIGNORE__ !== 'undefined' && Boolean(__TEMPLATE_GITIGNORE__)) { // Fallback behavior depends on __TEMPLATE_GITIGNORE__ which is global
      expect(result).toHaveProperty('globalGitIgnore')
    } else expect(result).toEqual({})
  })
})
