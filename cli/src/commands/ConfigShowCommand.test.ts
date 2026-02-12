import type {CommandContext} from './Command'
import type {CollectedInputContext, OutputCleanContext, OutputPlugin, OutputWriteContext, PluginOptions} from '@/types'
import * as nodeFs from 'node:fs'
import * as nodePath from 'node:path'
import process from 'node:process'
import * as fastGlob from 'fast-glob'
import {describe, expect, it, vi} from 'vitest'
import {createLogger} from '@/log'
import {parseArgs, resolveCommand} from '@/PluginPipeline'
import {ConfigShowCommand} from './ConfigShowCommand'

const mockLogger = createLogger('test', 'silent')

const mockUserConfigOptions: Required<PluginOptions> = {
  workspaceDir: '/test/workspace',
  shadowSourceProjectDir: '/test/workspace/tnmsc-shadow',
  shadowSkillSourceDir: '/test/workspace/tnmsc-shadow/dist/skills',
  shadowFastCommandDir: '/test/workspace/tnmsc-shadow/dist/commands',
  shadowSubAgentDir: '/test/workspace/tnmsc-shadow/dist/agents',
  globalMemoryFile: '/test/workspace/tnmsc-shadow/dist/GLOBAL.md',
  shadowProjectsDir: '/test/workspace/tnmsc-shadow/dist/app',
  externalProjects: [],
  excludePatterns: {},
  fastCommandSeriesOptions: {},
  plugins: [],
  logLevel: 'error'
}

function createMockCommandContext(outputPlugins: readonly OutputPlugin[] = []): CommandContext {
  const collectedInputContext: CollectedInputContext = {
    projects: [],
    globalMemory: void 0,
    skills: [],
    fastCommands: [],
    subAgents: [],
    projectPrompts: [],
    ideConfigs: [],
    aiAgentIgnoreConfigs: []
  }

  return {
    logger: mockLogger,
    outputPlugins,
    collectedInputContext,
    userConfigOptions: mockUserConfigOptions,
    createCleanContext: (dryRun: boolean): OutputCleanContext => ({
      logger: mockLogger,
      fs: nodeFs,
      path: nodePath,
      glob: fastGlob,
      collectedInputContext,
      dryRun
    }),
    createWriteContext: (dryRun: boolean): OutputWriteContext => ({
      logger: mockLogger,
      fs: nodeFs,
      path: nodePath,
      glob: fastGlob,
      collectedInputContext,
      dryRun,
      registeredPluginNames: outputPlugins.map(p => p.name)
    })
  }
}

describe('configShowCommand', () => {
  it('should have name "config-show"', () => {
    const command = new ConfigShowCommand()
    expect(command.name).toBe('config-show')
  })

  it('should write JSON to stdout and return success', async () => {
    const stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const command = new ConfigShowCommand()
    const ctx = createMockCommandContext()
    const result = await command.execute(ctx)

    expect(result.success).toBe(true)
    expect(result.filesAffected).toBe(0)
    expect(result.dirsAffected).toBe(0)

    expect(stdoutWriteSpy).toHaveBeenCalledOnce()

    const writtenData = stdoutWriteSpy.mock.calls[0]![0] as string
    expect(writtenData.endsWith('\n')).toBe(true)

    const parsed = JSON.parse(writtenData.trim())
    expect(parsed).toHaveProperty('merged')
    expect(parsed).toHaveProperty('sources')
    expect(Array.isArray(parsed.sources)).toBe(true)

    stdoutWriteSpy.mockRestore()
  })

  it('should output valid JsonConfigInfo structure', async () => {
    const stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const command = new ConfigShowCommand()
    await command.execute(createMockCommandContext())

    const writtenData = stdoutWriteSpy.mock.calls[0]![0] as string
    const parsed = JSON.parse(writtenData.trim())

    expect(typeof parsed.merged).toBe('object')
    expect(Array.isArray(parsed.sources)).toBe(true)

    for (const source of parsed.sources) {
      expect(source).toHaveProperty('path')
      expect(source).toHaveProperty('layer')
      expect(source).toHaveProperty('config')
      expect(['programmatic', 'cwd', 'global', 'default']).toContain(source.layer)
    }

    stdoutWriteSpy.mockRestore()
  })

  it('should include message in result', async () => {
    const stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const command = new ConfigShowCommand()
    const result = await command.execute(createMockCommandContext())

    expect(result.message).toMatch(/Configuration displayed/)

    stdoutWriteSpy.mockRestore()
  })
})

describe('parseArgs --show flag', () => {
  it('should parse --show long flag', () => {
    const result = parseArgs(['config', '--show'])
    expect(result.showFlag).toBe(true)
  })

  it('should default showFlag to false when not provided', () => {
    const result = parseArgs(['config'])
    expect(result.showFlag).toBe(false)
  })

  it('should combine --show with --json', () => {
    const result = parseArgs(['config', '--show', '--json'])
    expect(result.showFlag).toBe(true)
    expect(result.jsonFlag).toBe(true)
    expect(result.subcommand).toBe('config')
  })

  it('should not treat --show as unknown', () => {
    const result = parseArgs(['config', '--show'])
    expect(result.unknown).not.toContain('--show')
  })
})

describe('resolveCommand for config --show', () => {
  it('should resolve to ConfigShowCommand when config --show is used', () => {
    const args = parseArgs(['config', '--show'])
    const command = resolveCommand(args)
    expect(command.name).toBe('config-show')
  })

  it('should resolve to ConfigShowCommand when config --show --json is used', () => {
    const args = parseArgs(['config', '--show', '--json'])
    const command = resolveCommand(args)
    expect(command.name).toBe('config-show')
  })

  it('should still resolve to ConfigCommand when config key=value is used', () => {
    const args = parseArgs(['config', 'logLevel=debug'])
    const command = resolveCommand(args)
    expect(command.name).toBe('config')
  })
})
