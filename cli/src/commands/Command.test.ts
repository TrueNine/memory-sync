import { parseArgs } from '@/PluginPipeline'
import { describe, expect, it } from 'vitest'
import type {
    ConfigSource,
    JsonCommandResult,
    JsonConfigInfo,
    JsonPluginInfo,
    PluginExecutionResult
} from './Command'

describe('JsonCommandResult interface', () => {
  it('should represent a successful command result with plugin details', () => {
    const result: JsonCommandResult = {
      success: true,
      filesAffected: 5,
      dirsAffected: 2,
      message: 'Pipeline executed successfully',
      pluginResults: [
        {
          pluginName: 'GlobalMemoryInputPlugin',
          kind: 'Input',
          status: 'success',
          duration: 120
        },
        {
          pluginName: 'WarpIDEOutputPlugin',
          kind: 'Output',
          status: 'success',
          filesWritten: 3,
          duration: 250
        }
      ],
      errors: []
    }

    expect(result.success).toBe(true)
    expect(result.filesAffected).toBe(5)
    expect(result.dirsAffected).toBe(2)
    expect(result.pluginResults).toHaveLength(2)
    expect(result.errors).toHaveLength(0)
  })

  it('should represent a failed command result with errors', () => {
    const result: JsonCommandResult = {
      success: false,
      filesAffected: 0,
      dirsAffected: 0,
      pluginResults: [
        {
          pluginName: 'BrokenPlugin',
          kind: 'Output',
          status: 'failed',
          error: 'Permission denied'
        }
      ],
      errors: ['Pipeline failed: 1 plugin error']
    }

    expect(result.success).toBe(false)
    expect(result.errors).toContain('Pipeline failed: 1 plugin error')
    expect(result.pluginResults![0]!.status).toBe('failed')
    expect(result.pluginResults![0]!.error).toBe('Permission denied')
  })

  it('should allow optional fields to be omitted', () => {
    const minimal: JsonCommandResult = {
      success: true,
      filesAffected: 0,
      dirsAffected: 0
    }

    expect(minimal.message).toBeUndefined()
    expect(minimal.pluginResults).toBeUndefined()
    expect(minimal.errors).toBeUndefined()
  })
})

describe('PluginExecutionResult interface', () => {
  it('should represent a successful plugin execution', () => {
    const result: PluginExecutionResult = {
      pluginName: 'ClaudeCodeCLIOutputPlugin',
      kind: 'Output',
      status: 'success',
      filesWritten: 2,
      duration: 150
    }

    expect(result.pluginName).toBe('ClaudeCodeCLIOutputPlugin')
    expect(result.kind).toBe('Output')
    expect(result.status).toBe('success')
    expect(result.filesWritten).toBe(2)
  })

  it('should represent a skipped plugin', () => {
    const result: PluginExecutionResult = {
      pluginName: 'SkippedPlugin',
      kind: 'Input',
      status: 'skipped'
    }

    expect(result.status).toBe('skipped')
    expect(result.filesWritten).toBeUndefined()
    expect(result.error).toBeUndefined()
    expect(result.duration).toBeUndefined()
  })
})

describe('JsonConfigInfo interface', () => {
  it('should represent config with multiple sources', () => {
    const configInfo: JsonConfigInfo = {
      merged: {
        logLevel: 'info'
      },
      sources: [
        {
          path: '/home/user/.aindex/.tnmsc.json',
          layer: 'global',
          config: {logLevel: 'debug'}
        },
        {
          path: '/project/.tnmsc.json',
          layer: 'cwd',
          config: {logLevel: 'info'}
        }
      ]
    }

    expect(configInfo.sources).toHaveLength(2)
    expect(configInfo.sources[0]!.layer).toBe('global')
    expect(configInfo.sources[1]!.layer).toBe('cwd')
  })
})

describe('JsonPluginInfo interface', () => {
  it('should represent a plugin with dependencies', () => {
    const pluginInfo: JsonPluginInfo = {
      name: 'WarpIDEOutputPlugin',
      kind: 'Output',
      description: 'Warp IDE output plugin',
      dependencies: ['GlobalMemoryInputPlugin', 'SkillInputPlugin']
    }

    expect(pluginInfo.kind).toBe('Output')
    expect(pluginInfo.dependencies).toHaveLength(2)
  })

  it('should represent a plugin with no dependencies', () => {
    const pluginInfo: JsonPluginInfo = {
      name: 'GlobalMemoryInputPlugin',
      kind: 'Input',
      description: 'Global memory input plugin',
      dependencies: []
    }

    expect(pluginInfo.dependencies).toHaveLength(0)
  })
})

describe('ConfigSource interface', () => {
  it('should support all four layer types', () => {
    const layers: ConfigSource['layer'][] = ['programmatic', 'cwd', 'global', 'default']

    for (const layer of layers) {
      const source: ConfigSource = {
        path: `/some/path`,
        layer,
        config: {}
      }
      expect(source.layer).toBe(layer)
    }
  })
})

describe('parseArgs --json flag', () => {
  it('should parse --json long flag', () => {
    const result = parseArgs(['execute', '--json'])

    expect(result.jsonFlag).toBe(true)
  })

  it('should parse -j short flag', () => {
    const result = parseArgs(['execute', '-j'])

    expect(result.jsonFlag).toBe(true)
  })

  it('should default jsonFlag to false when not provided', () => {
    const result = parseArgs(['execute'])

    expect(result.jsonFlag).toBe(false)
  })

  it('should combine --json with other flags', () => {
    const result = parseArgs(['execute', '--json', '--dry-run'])

    expect(result.jsonFlag).toBe(true)
    expect(result.dryRun).toBe(true)
  })

  it('should combine -j with other short flags', () => {
    const result = parseArgs(['clean', '-jn'])

    expect(result.jsonFlag).toBe(true)
    expect(result.dryRun).toBe(true)
  })

  it('should not treat --json as unknown', () => {
    const result = parseArgs(['--json'])

    expect(result.jsonFlag).toBe(true)
    expect(result.unknown).not.toContain('--json')
  })
})
