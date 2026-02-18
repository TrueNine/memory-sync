import type {CommandContext, JsonPluginInfo} from './Command'
import type {CollectedInputContext, InputPlugin, OutputCleanContext, OutputPlugin, OutputWriteContext, PluginOptions} from '@/types'
import * as nodeFs from 'node:fs'
import * as nodePath from 'node:path'
import process from 'node:process'
import * as fastGlob from 'fast-glob'
import {describe, expect, it, vi} from 'vitest'
import {createLogger} from '@/log'
import {parseArgs, resolveCommand} from '@/PluginPipeline'
import {PluginKind} from '@/types'
import {PluginsCommand} from './PluginsCommand'

const mockLogger = createLogger('test', 'silent')

function createMockOutputPlugin(name: string, dependsOn?: readonly string[]): OutputPlugin {
  return {
    name,
    type: PluginKind.Output,
    log: mockLogger,
    dependsOn,
    write: vi.fn(async () => ({files: [], dirs: []})),
    clean: vi.fn(async () => ({files: [], dirs: []}))
  }
}

function createMockInputPlugin(name: string, dependsOn?: readonly string[]): InputPlugin {
  return {
    name,
    type: PluginKind.Input,
    log: mockLogger,
    dependsOn,
    collect: vi.fn(async () => ({}))
  }
}

function createMockCommandContext(
  outputPlugins: readonly OutputPlugin[] = [],
  plugins: (InputPlugin | OutputPlugin)[] = []
): CommandContext {
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

  const mockUserConfigOptions: Required<PluginOptions> = {
    workspaceDir: '/test/workspace',
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
    fastCommandSeriesOptions: {},
    plugins,
    logLevel: 'error'
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

describe('pluginsCommand', () => {
  it('should have name "plugins"', () => {
    const command = new PluginsCommand()
    expect(command.name).toBe('plugins')
  })

  it('should write JSON array to stdout and return success', async () => {
    const stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const inputPlugin = createMockInputPlugin('TestInputPlugin')
    const outputPlugin = createMockOutputPlugin('TestOutputPlugin')

    const command = new PluginsCommand()
    const ctx = createMockCommandContext([outputPlugin], [inputPlugin, outputPlugin])
    const result = await command.execute(ctx)

    expect(result.success).toBe(true)
    expect(result.filesAffected).toBe(0)
    expect(result.dirsAffected).toBe(0)

    expect(stdoutWriteSpy).toHaveBeenCalledOnce()

    const writtenData = stdoutWriteSpy.mock.calls[0]![0] as string
    expect(writtenData.endsWith('\n')).toBe(true)

    const parsed = JSON.parse(writtenData.trim()) as JsonPluginInfo[]
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed.length).toBe(2)

    stdoutWriteSpy.mockRestore()
  })

  it('should output valid JsonPluginInfo structure for each plugin', async () => {
    const stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const inputPlugin = createMockInputPlugin('GlobalMemoryInputPlugin', ['WorkspaceInputPlugin'])
    const outputPlugin = createMockOutputPlugin('WarpIDEOutputPlugin', ['GlobalMemoryInputPlugin'])

    const command = new PluginsCommand()
    await command.execute(createMockCommandContext([outputPlugin], [inputPlugin, outputPlugin]))

    const writtenData = stdoutWriteSpy.mock.calls[0]![0] as string
    const parsed = JSON.parse(writtenData.trim()) as JsonPluginInfo[]

    for (const info of parsed) {
      expect(info).toHaveProperty('name')
      expect(info).toHaveProperty('kind')
      expect(info).toHaveProperty('description')
      expect(info).toHaveProperty('dependencies')
      expect(['Input', 'Output']).toContain(info.kind)
      expect(Array.isArray(info.dependencies)).toBe(true)
    }

    const inputInfo = parsed.find(p => p.name === 'GlobalMemoryInputPlugin')!
    expect(inputInfo.kind).toBe('Input')
    expect(inputInfo.dependencies).toEqual(['WorkspaceInputPlugin'])

    const outputInfo = parsed.find(p => p.name === 'WarpIDEOutputPlugin')!
    expect(outputInfo.kind).toBe('Output')
    expect(outputInfo.dependencies).toEqual(['GlobalMemoryInputPlugin'])

    stdoutWriteSpy.mockRestore()
  })

  it('should include output plugins not in userConfigOptions.plugins', async () => {
    const stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const inputPlugin = createMockInputPlugin('TestInput')
    const extraOutputPlugin = createMockOutputPlugin('ExtraOutput')

    const command = new PluginsCommand() // inputPlugin is in plugins, extraOutputPlugin is only in outputPlugins
    await command.execute(createMockCommandContext([extraOutputPlugin], [inputPlugin]))

    const writtenData = stdoutWriteSpy.mock.calls[0]![0] as string
    const parsed = JSON.parse(writtenData.trim()) as JsonPluginInfo[]

    expect(parsed).toHaveLength(2)
    expect(parsed.map(p => p.name)).toContain('TestInput')
    expect(parsed.map(p => p.name)).toContain('ExtraOutput')

    stdoutWriteSpy.mockRestore()
  })

  it('should not duplicate plugins that appear in both lists', async () => {
    const stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const outputPlugin = createMockOutputPlugin('SharedPlugin')

    const command = new PluginsCommand() // Same plugin in both userConfigOptions.plugins and outputPlugins
    await command.execute(createMockCommandContext([outputPlugin], [outputPlugin]))

    const writtenData = stdoutWriteSpy.mock.calls[0]![0] as string
    const parsed = JSON.parse(writtenData.trim()) as JsonPluginInfo[]

    const sharedCount = parsed.filter(p => p.name === 'SharedPlugin').length
    expect(sharedCount).toBe(1)

    stdoutWriteSpy.mockRestore()
  })

  it('should handle empty plugin lists', async () => {
    const stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const command = new PluginsCommand()
    const result = await command.execute(createMockCommandContext([], []))

    expect(result.success).toBe(true)

    const writtenData = stdoutWriteSpy.mock.calls[0]![0] as string
    const parsed = JSON.parse(writtenData.trim()) as JsonPluginInfo[]
    expect(parsed).toHaveLength(0)

    stdoutWriteSpy.mockRestore()
  })

  it('should include message with plugin count', async () => {
    const stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const plugin = createMockInputPlugin('TestPlugin')
    const command = new PluginsCommand()
    const result = await command.execute(createMockCommandContext([], [plugin]))

    expect(result.message).toMatch(/Listed 1 plugin/)

    stdoutWriteSpy.mockRestore()
  })
})

describe('parseArgs plugins subcommand', () => {
  it('should parse "plugins" as a valid subcommand', () => {
    const result = parseArgs(['plugins'])
    expect(result.subcommand).toBe('plugins')
  })

  it('should parse "plugins --json"', () => {
    const result = parseArgs(['plugins', '--json'])
    expect(result.subcommand).toBe('plugins')
    expect(result.jsonFlag).toBe(true)
  })

  it('should not treat "plugins" as unknown command', () => {
    const result = parseArgs(['plugins'])
    expect(result.unknownCommand).toBeUndefined()
  })
})

describe('resolveCommand for plugins', () => {
  it('should resolve to PluginsCommand when plugins subcommand is used', () => {
    const args = parseArgs(['plugins'])
    const command = resolveCommand(args)
    expect(command.name).toBe('plugins')
  })

  it('should resolve to PluginsCommand when plugins --json is used', () => {
    const args = parseArgs(['plugins', '--json'])
    const command = resolveCommand(args)
    expect(command.name).toBe('plugins')
  })
})
