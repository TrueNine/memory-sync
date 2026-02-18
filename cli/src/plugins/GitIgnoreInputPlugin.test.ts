import type {InputPluginContext} from '@/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {createLogger} from '@/log'
import {GitIgnoreInputPlugin} from './GitIgnoreInputPlugin'

vi.mock('node:fs')

const BASE_OPTIONS = {
  workspaceDir: '/workspace',
  shadowSourceProject: {
    name: 'tnmsc-shadow',
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

describe('gitIgnoreInputPlugin', () => {
  beforeEach(() => vi.clearAllMocks())

  it('should collect gitignore content from file if it exists', () => {
    const plugin = new GitIgnoreInputPlugin()
    const ctx = {
      logger: createLogger('test', 'debug'),
      fs,
      userConfigOptions: BASE_OPTIONS
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
      userConfigOptions: BASE_OPTIONS
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
