import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { PipelineResult, PluginExecutionResult } from '@/api/bridge'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { invoke } from '@tauri-apps/api/core'

import { cleanOutputs, executePipeline, listPlugins, loadConfig } from '@/api/bridge'

const mockedInvoke = vi.mocked(invoke)

beforeEach(() => {
  mockedInvoke.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('executePipeline', () => {
  const mockResult: PipelineResult = {
    success: true,
    totalFiles: 5,
    totalDirs: 2,
    dryRun: false,
    pluginResults: [
      {
        plugin: 'GlobalMemoryInputPlugin',
        files: 3,
        dirs: 1,
        dryRun: false,
      },
    ],
    logs: [],
    errors: [],
  }

  it('should invoke execute_pipeline with cwd and dryRun', async () => {
    mockedInvoke.mockResolvedValue(mockResult)

    const result = await executePipeline('/home/user/project', true)

    expect(mockedInvoke).toHaveBeenCalledOnce()
    expect(mockedInvoke).toHaveBeenCalledWith('execute_pipeline', {
      cwd: '/home/user/project',
      dryRun: true,
    })
    expect(result).toEqual(mockResult)
  })

  it('should default dryRun to false', async () => {
    mockedInvoke.mockResolvedValue(mockResult)

    await executePipeline('/workspace')

    expect(mockedInvoke).toHaveBeenCalledWith('execute_pipeline', {
      cwd: '/workspace',
      dryRun: false,
    })
  })

  it('should propagate invoke rejection', async () => {
    mockedInvoke.mockRejectedValue(new Error('sidecar not found'))

    await expect(executePipeline('/bad/path')).rejects.toThrow('sidecar not found')
  })
})

describe('cleanOutputs', () => {
  const mockResult: PipelineResult = {
    success: true,
    totalFiles: 3,
    totalDirs: 1,
    dryRun: false,
    pluginResults: [],
    logs: [],
    errors: [],
  }

  it('should invoke clean_outputs with cwd and dryRun', async () => {
    mockedInvoke.mockResolvedValue(mockResult)

    const result = await cleanOutputs('/home/user/project', true)

    expect(mockedInvoke).toHaveBeenCalledOnce()
    expect(mockedInvoke).toHaveBeenCalledWith('clean_outputs', {
      cwd: '/home/user/project',
      dryRun: true,
    })
    expect(result).toEqual(mockResult)
  })

  it('should default dryRun to false', async () => {
    mockedInvoke.mockResolvedValue(mockResult)

    await cleanOutputs('/workspace')

    expect(mockedInvoke).toHaveBeenCalledWith('clean_outputs', {
      cwd: '/workspace',
      dryRun: false,
    })
  })

  it('should propagate invoke rejection', async () => {
    mockedInvoke.mockRejectedValue(new Error('JSON parse error'))

    await expect(cleanOutputs('/bad/path')).rejects.toThrow('JSON parse error')
  })
})

describe('loadConfig', () => {
  const mockConfig = {
    merged: {
      logLevel: 'info',
      plugins: ['plugin-a', 'plugin-b'],
      excludePatterns: { global: ['*.log'] },
    },
    sources: [
      { path: '/home/user/.aindex/.tnmsc.json', layer: 'global', config: { logLevel: 'info' } },
    ],
  }

  it('should invoke load_config with cwd only', async () => {
    mockedInvoke.mockResolvedValue(mockConfig)

    const result = await loadConfig('/home/user/project')

    expect(mockedInvoke).toHaveBeenCalledOnce()
    expect(mockedInvoke).toHaveBeenCalledWith('load_config', {
      cwd: '/home/user/project',
    })
    expect(result).toEqual(mockConfig)
  })

  it('should propagate invoke rejection', async () => {
    mockedInvoke.mockRejectedValue(new Error('config file not found'))

    await expect(loadConfig('/missing')).rejects.toThrow('config file not found')
  })
})

describe('listPlugins', () => {
  const mockPlugins: PluginExecutionResult[] = [
    {
      plugin: 'GlobalMemoryInputPlugin',
      files: 5,
      dirs: 2,
      dryRun: false,
    },
    {
      plugin: 'ClaudeCodeCLIOutputPlugin',
      files: 3,
      dirs: 1,
      dryRun: false,
    },
  ]

  it('should invoke list_plugins with cwd only', async () => {
    mockedInvoke.mockResolvedValue(mockPlugins)

    const result = await listPlugins('/home/user/project')

    expect(mockedInvoke).toHaveBeenCalledOnce()
    expect(mockedInvoke).toHaveBeenCalledWith('list_plugins', {
      cwd: '/home/user/project',
    })
    expect(result).toEqual(mockPlugins)
  })

  it('should return typed PluginExecutionResult array', async () => {
    mockedInvoke.mockResolvedValue(mockPlugins)

    const result = await listPlugins('/workspace')

    expect(result).toHaveLength(2)
    expect(result[0].plugin).toBe('GlobalMemoryInputPlugin')
    expect(result[0].files).toBe(5)
    expect(result[1].plugin).toBe('ClaudeCodeCLIOutputPlugin')
  })

  it('should propagate invoke rejection', async () => {
    mockedInvoke.mockRejectedValue(new Error('timeout'))

    await expect(listPlugins('/slow')).rejects.toThrow('timeout')
  })
})
