import { createLogger } from '@/log'
import type { CollectedInputContext, OutputCleanContext, OutputPlugin, OutputWriteContext, PluginOptions } from '@/types'
import * as fastGlob from 'fast-glob'
import * as nodeFs from 'node:fs'
import * as nodePath from 'node:path'
import process from 'node:process'
import { describe, expect, it, vi } from 'vitest'
import type { CommandContext, CommandResult } from './Command'
import { JsonOutputCommand, toJsonCommandResult } from './JsonOutputCommand'

const mockLogger = createLogger('test', 'silent')

const mockUserConfigOptions: Required<PluginOptions> = {
  workspaceDir: '/test/workspace',
  shadowSourceProjectDir: '/test/workspace/aindex',
  shadowSkillSourceDir: '/test/workspace/aindex/dist/skills',
  shadowFastCommandDir: '/test/workspace/aindex/dist/commands',
  shadowSubAgentDir: '/test/workspace/aindex/dist/agents',
  globalMemoryFile: '/test/workspace/aindex/dist/GLOBAL.md',
  shadowProjectsDir: '/test/workspace/aindex/dist/app',
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

describe('toJsonCommandResult', () => {
  it('should convert a successful CommandResult with all fields', () => {
    const result: CommandResult = {
      success: true,
      filesAffected: 10,
      dirsAffected: 3,
      message: 'Pipeline executed successfully'
    }

    const json = toJsonCommandResult(result)

    expect(json.success).toBe(true)
    expect(json.filesAffected).toBe(10)
    expect(json.dirsAffected).toBe(3)
    expect(json.message).toBe('Pipeline executed successfully')
    expect(json.pluginResults).toEqual([])
    expect(json.errors).toEqual([])
  })

  it('should convert a failed CommandResult', () => {
    const result: CommandResult = {
      success: false,
      filesAffected: 0,
      dirsAffected: 0
    }

    const json = toJsonCommandResult(result)

    expect(json.success).toBe(false)
    expect(json.filesAffected).toBe(0)
    expect(json.dirsAffected).toBe(0)
    expect(json.message).toBeUndefined()
    expect(json.pluginResults).toEqual([])
    expect(json.errors).toEqual([])
  })

  it('should omit message when CommandResult has no message', () => {
    const result: CommandResult = {
      success: true,
      filesAffected: 5,
      dirsAffected: 1
    }

    const json = toJsonCommandResult(result)

    expect('message' in json).toBe(false)
  })

  it('should produce valid JSON when stringified', () => {
    const result: CommandResult = {
      success: true,
      filesAffected: 7,
      dirsAffected: 2,
      message: 'Done'
    }

    const json = toJsonCommandResult(result)
    const str = JSON.stringify(json)
    const parsed = JSON.parse(str)

    expect(parsed.success).toBe(true)
    expect(parsed.filesAffected).toBe(7)
    expect(parsed.dirsAffected).toBe(2)
    expect(parsed.message).toBe('Done')
    expect(parsed.pluginResults).toEqual([])
    expect(parsed.errors).toEqual([])
  })
})

describe('jsonOutputCommand', () => {
  it('should set name to json:<inner.name>', () => {
    const inner = {
      name: 'execute',
      execute: vi.fn(async () => ({success: true, filesAffected: 0, dirsAffected: 0}))
    }

    const command = new JsonOutputCommand(inner)

    expect(command.name).toBe('json:execute')
  })

  it('should delegate execution to the inner command', async () => {
    const expectedResult: CommandResult = {
      success: true,
      filesAffected: 5,
      dirsAffected: 2,
      message: 'test'
    }
    const inner = {
      name: 'clean',
      execute: vi.fn(async () => expectedResult)
    }

    const stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const command = new JsonOutputCommand(inner)
    const ctx = createMockCommandContext()
    const result = await command.execute(ctx)

    expect(inner.execute).toHaveBeenCalledWith(ctx)
    expect(result).toBe(expectedResult)

    stdoutWriteSpy.mockRestore()
  })

  it('should write JSON to stdout', async () => {
    const inner = {
      name: 'execute',
      execute: vi.fn(async () => ({
        success: true,
        filesAffected: 3,
        dirsAffected: 1,
        message: 'Pipeline done'
      }))
    }

    const stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const command = new JsonOutputCommand(inner)
    await command.execute(createMockCommandContext())

    expect(stdoutWriteSpy).toHaveBeenCalledOnce()

    const writtenData = stdoutWriteSpy.mock.calls[0]![0] as string
    const parsed = JSON.parse(writtenData)

    expect(parsed.success).toBe(true)
    expect(parsed.filesAffected).toBe(3)
    expect(parsed.dirsAffected).toBe(1)
    expect(parsed.message).toBe('Pipeline done')
    expect(parsed.pluginResults).toEqual([])
    expect(parsed.errors).toEqual([])

    stdoutWriteSpy.mockRestore()
  })

  it('should output valid JSON terminated with newline', async () => {
    const inner = {
      name: 'dry-run-output',
      execute: vi.fn(async () => ({
        success: true,
        filesAffected: 0,
        dirsAffected: 0
      }))
    }

    const stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const command = new JsonOutputCommand(inner)
    await command.execute(createMockCommandContext())

    const writtenData = stdoutWriteSpy.mock.calls[0]![0] as string
    expect(writtenData.endsWith('\n')).toBe(true)

    // Should not throw when parsing (valid JSON)
    expect(() => JSON.parse(writtenData.trim())).not.toThrow()

    stdoutWriteSpy.mockRestore()
  })

  it('should return the original CommandResult from inner command', async () => {
    const innerResult: CommandResult = {
      success: false,
      filesAffected: 0,
      dirsAffected: 0,
      message: 'Something failed'
    }
    const inner = {
      name: 'execute',
      execute: vi.fn(async () => innerResult)
    }

    const stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    const command = new JsonOutputCommand(inner)
    const result = await command.execute(createMockCommandContext())

    // The returned result should be the original, not the JSON version
    expect(result).toBe(innerResult)
    expect(result.success).toBe(false)
    expect(result.message).toBe('Something failed')

    stdoutWriteSpy.mockRestore()
  })

  it('should work with different inner command names', async () => {
    for (const name of ['execute', 'clean', 'dry-run-output']) {
      const inner = {
        name,
        execute: vi.fn(async () => ({success: true, filesAffected: 0, dirsAffected: 0}))
      }

      const command = new JsonOutputCommand(inner)
      expect(command.name).toBe(`json:${name}`)
    }
  })
})
