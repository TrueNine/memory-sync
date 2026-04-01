import type {ILogger} from '@truenine/logger'
import type {OutputPlugin, OutputWriteContext} from './plugin'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {describe, expect, it} from 'vitest'
import {FilePathKind, PluginKind} from './enums'
import {
  collectAllPluginOutputs,
  executeDeclarativeWriteOutputs,
  validateOutputScopeOverridesForPlugins
} from './plugin'

function createMockLogger(): ILogger {
  return {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    fatal: () => {}
  } as ILogger
}

function createMockWriteContext(pluginName: string, topicOverride: Record<string, unknown>): OutputWriteContext {
  return {
    logger: createMockLogger(),
    fs,
    path,
    glob: {} as never,
    dryRun: true,
    pluginOptions: {
      outputScopes: {
        plugins: {
          [pluginName]: topicOverride
        }
      }
    },
    collectedOutputContext: {
      workspace: {
        directory: {
          pathKind: FilePathKind.Relative,
          path: '.',
          basePath: '.',
          getDirectoryName: () => '.',
          getAbsolutePath: () => path.resolve('.')
        },
        projects: []
      }
    }
  } as OutputWriteContext
}

function createMockOutputPlugin(name: string): OutputPlugin {
  return {
    type: PluginKind.Output,
    name,
    log: createMockLogger(),
    declarativeOutput: true,
    outputCapabilities: {
      commands: {
        scopes: ['global'],
        singleScope: true
      }
    },
    async declareOutputFiles() {
      return []
    },
    async convertContent() {
      return ''
    }
  }
}

function createMultiScopeOutputPlugin(name: string): OutputPlugin {
  return {
    type: PluginKind.Output,
    name,
    log: createMockLogger(),
    declarativeOutput: true,
    outputCapabilities: {
      commands: {
        scopes: ['project', 'global'],
        singleScope: false
      }
    },
    async declareOutputFiles() {
      return []
    },
    async convertContent() {
      return ''
    }
  }
}

function createScopedDeclarationPlugin(name: string): OutputPlugin {
  return {
    type: PluginKind.Output,
    name,
    log: createMockLogger(),
    declarativeOutput: true,
    outputCapabilities: {},
    async declareOutputFiles() {
      return [
        {path: path.resolve('tmp/project.txt'), scope: 'project', source: {}},
        {path: path.resolve('tmp/global.txt'), scope: 'global', source: {}}
      ]
    },
    async convertContent() {
      return ''
    }
  }
}

describe('outputScopes capability validation', () => {
  it('accepts valid topic override', async () => {
    const plugin = createMockOutputPlugin('MockOutputPlugin')
    const ctx = createMockWriteContext(plugin.name, {commands: 'global'})

    const result = await executeDeclarativeWriteOutputs([plugin], ctx)
    expect(result.has(plugin.name)).toBe(true)
  })

  it('throws when override topic is unsupported by plugin capabilities', async () => {
    const plugin = createMockOutputPlugin('MockOutputPlugin')
    const ctx = createMockWriteContext(plugin.name, {rules: 'global'})

    await expect(executeDeclarativeWriteOutputs([plugin], ctx))
      .rejects
      .toThrow('does not support topic "rules"')
  })

  it('throws when override scope is not allowed by plugin capabilities', async () => {
    const plugin = createMockOutputPlugin('MockOutputPlugin')
    const ctx = createMockWriteContext(plugin.name, {commands: 'project'})

    await expect(executeDeclarativeWriteOutputs([plugin], ctx))
      .rejects
      .toThrow('requests unsupported scopes [project]')
  })

  it('applies the same validation in output collection path', async () => {
    const plugin = createMockOutputPlugin('MockOutputPlugin')
    const ctx = createMockWriteContext(plugin.name, {rules: 'global'})

    await expect(collectAllPluginOutputs([plugin], ctx))
      .rejects
      .toThrow('does not support topic "rules"')
  })

  it('throws for multi-scope selection on single-scope topic', () => {
    const plugin = createMockOutputPlugin('MockOutputPlugin')
    const ctx = createMockWriteContext(plugin.name, {commands: ['global', 'project']})

    expect(() => validateOutputScopeOverridesForPlugins([plugin], ctx.pluginOptions))
      .toThrow('is single-scope and cannot request multiple scopes')
  })

  it('accepts multi-scope selection when the topic supports parallel scopes', () => {
    const plugin = createMultiScopeOutputPlugin('MultiScopeOutputPlugin')
    const ctx = createMockWriteContext(plugin.name, {commands: ['project', 'global']})

    expect(() => validateOutputScopeOverridesForPlugins([plugin], ctx.pluginOptions)).not.toThrow()
  })

  it('rejects workspace as an unsupported override scope', () => {
    const plugin = createMultiScopeOutputPlugin('MultiScopeOutputPlugin')
    const ctx = createMockWriteContext(plugin.name, {commands: 'workspace'})

    expect(() => validateOutputScopeOverridesForPlugins([plugin], ctx.pluginOptions))
      .toThrow('requests unsupported scopes [workspace]')
  })

  it('classifies project and global declarations during output collection', async () => {
    const plugin = createScopedDeclarationPlugin('ScopedDeclarationPlugin')
    const ctx = createMockWriteContext(plugin.name, {})

    const outputs = await collectAllPluginOutputs([plugin], ctx)

    expect(outputs.projectFiles).toEqual([path.resolve('tmp/project.txt')])
    expect(outputs.globalFiles).toEqual([path.resolve('tmp/global.txt')])
  })
})
