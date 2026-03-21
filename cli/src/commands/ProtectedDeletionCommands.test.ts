import type {ILogger, OutputCleanContext, OutputCleanupDeclarations, OutputPlugin, OutputWriteContext} from '../plugins/plugin-core'
import type {CommandContext} from './Command'
import * as fs from 'node:fs'
import * as path from 'node:path'
import glob from 'fast-glob'
import {describe, expect, it, vi} from 'vitest'
import {createLogger, FilePathKind, PluginKind} from '../plugins/plugin-core'
import {CleanCommand} from './CleanCommand'
import {DryRunCleanCommand} from './DryRunCleanCommand'
import {ExecuteCommand} from './ExecuteCommand'
import {JsonOutputCommand} from './JsonOutputCommand'

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

function createMockOutputPlugin(
  cleanup?: OutputCleanupDeclarations,
  convertContent?: OutputPlugin['convertContent']
): OutputPlugin {
  return {
    type: PluginKind.Output,
    name: 'MockOutputPlugin',
    log: createMockLogger(),
    declarativeOutput: true,
    outputCapabilities: {},
    async declareOutputFiles() {
      return [{path: path.join(path.resolve('tmp-workspace-command'), 'project-a', 'AGENTS.md'), source: {}}]
    },
    async declareCleanupPaths() {
      return cleanup ?? {}
    },
    async convertContent(declaration, ctx) {
      if (convertContent != null) return convertContent(declaration, ctx)
      return 'test'
    }
  }
}

function createCommandContext(
  outputPlugins: readonly OutputPlugin[],
  workspaceDir: string = path.resolve('tmp-workspace-command')
): CommandContext {
  const aindexDir = path.join(workspaceDir, 'aindex')
  const collectedOutputContext = {
    workspace: {
      directory: {
        pathKind: FilePathKind.Absolute,
        path: workspaceDir,
        getDirectoryName: () => path.basename(workspaceDir),
        getAbsolutePath: () => workspaceDir
      },
      projects: [{
        dirFromWorkspacePath: {
          pathKind: FilePathKind.Relative,
          path: 'project-a',
          basePath: workspaceDir,
          getDirectoryName: () => 'project-a',
          getAbsolutePath: () => path.join(workspaceDir, 'project-a')
        }
      }]
    },
    aindexDir
  }

  return {
    logger: createMockLogger(),
    outputPlugins,
    collectedOutputContext,
    userConfigOptions: {
      version: '0.0.0',
      workspaceDir,
      logLevel: 'info',
      aindex: {
        dir: 'aindex',
        skills: {src: 'skills', dist: 'dist/skills'},
        commands: {src: 'commands', dist: 'dist/commands'},
        subAgents: {src: 'subagents', dist: 'dist/subagents'},
        rules: {src: 'rules', dist: 'dist/rules'},
        globalPrompt: {src: 'global.src.mdx', dist: 'dist/global.mdx'},
        workspacePrompt: {src: 'workspace.src.mdx', dist: 'dist/workspace.mdx'},
        app: {src: 'app', dist: 'dist/app'},
        ext: {src: 'ext', dist: 'dist/ext'},
        arch: {src: 'arch', dist: 'dist/arch'}
      },
      commandSeriesOptions: {},
      outputScopes: {},
      cleanupProtection: {},
      plugins: []
    },
    createCleanContext: (dryRun: boolean): OutputCleanContext => ({
      logger: createMockLogger(),
      fs,
      path,
      glob,
      collectedOutputContext,
      pluginOptions: {
        version: '0.0.0',
        workspaceDir,
        logLevel: 'info',
        aindex: {
          dir: 'aindex',
          skills: {src: 'skills', dist: 'dist/skills'},
          commands: {src: 'commands', dist: 'dist/commands'},
          subAgents: {src: 'subagents', dist: 'dist/subagents'},
          rules: {src: 'rules', dist: 'dist/rules'},
          globalPrompt: {src: 'global.src.mdx', dist: 'dist/global.mdx'},
          workspacePrompt: {src: 'workspace.src.mdx', dist: 'dist/workspace.mdx'},
          app: {src: 'app', dist: 'dist/app'},
          ext: {src: 'ext', dist: 'dist/ext'},
          arch: {src: 'arch', dist: 'dist/arch'}
        },
        commandSeriesOptions: {},
        outputScopes: {},
        cleanupProtection: {},
        plugins: []
      },
      dryRun
    }),
    createWriteContext: (dryRun: boolean): OutputWriteContext => ({
      logger: createMockLogger(),
      fs,
      path,
      glob,
      collectedOutputContext,
      dryRun,
      registeredPluginNames: outputPlugins.map(plugin => plugin.name)
    })
  }
}

describe('protected deletion commands', () => {
  it('returns failure for clean and dry-run-clean when cleanup hits a protected path', async () => {
    const workspaceDir = path.resolve('tmp-workspace-command')
    const plugin = createMockOutputPlugin({
      delete: [{kind: 'directory', path: workspaceDir}]
    })
    const ctx = createCommandContext([plugin])

    await expect(new CleanCommand().execute(ctx)).resolves.toEqual(expect.objectContaining({
      success: false,
      message: expect.stringContaining('Protected deletion guard blocked cleanup')
    }))
    await expect(new DryRunCleanCommand().execute(ctx)).resolves.toEqual(expect.objectContaining({
      success: false,
      message: expect.stringContaining('Protected deletion guard blocked cleanup')
    }))
  })

  it('returns failure before writes run when execute pre-cleanup hits a protected path', async () => {
    const workspaceDir = path.resolve('tmp-workspace-command')
    const convertContent = vi.fn(async () => 'should-not-write')
    const plugin = createMockOutputPlugin({
      delete: [{kind: 'directory', path: workspaceDir}]
    }, convertContent)
    const ctx = createCommandContext([plugin])

    await expect(new ExecuteCommand().execute(ctx)).resolves.toEqual(expect.objectContaining({
      success: false,
      message: expect.stringContaining('Protected deletion guard blocked cleanup')
    }))
    expect(convertContent).not.toHaveBeenCalled()
  })

  it('returns failure when an output path conflicts with a cleanup protect declaration', async () => {
    const outputPath = path.join(path.resolve('tmp-workspace-command'), 'project-a', 'AGENTS.md')
    const plugin = createMockOutputPlugin({
      protect: [{kind: 'file', path: outputPath}]
    })
    const ctx = createCommandContext([plugin])

    await expect(new CleanCommand().execute(ctx)).resolves.toEqual(expect.objectContaining({
      success: false,
      message: expect.stringContaining('Cleanup protection conflict')
    }))
  })

  it('reuses declared outputs across cleanup and write during execute', async () => {
    const workspaceDir = path.resolve('tmp-workspace-command-cached')
    const outputPath = path.join(workspaceDir, 'project-a', 'AGENTS.md')
    let declareOutputFilesCalls = 0
    const plugin: OutputPlugin = {
      type: PluginKind.Output,
      name: 'CachedOutputPlugin',
      log: createMockLogger(),
      declarativeOutput: true,
      outputCapabilities: {},
      async declareOutputFiles() {
        declareOutputFilesCalls += 1
        return [{path: outputPath, source: {}}]
      },
      async declareCleanupPaths() {
        return {}
      },
      async convertContent() {
        return 'cached-output'
      }
    }

    fs.rmSync(workspaceDir, {recursive: true, force: true})
    fs.mkdirSync(path.join(workspaceDir, 'project-a'), {recursive: true})

    try {
      const ctx = createCommandContext([plugin], workspaceDir)
      const result = await new ExecuteCommand().execute(ctx)

      expect(result.success).toBe(true)
      expect(declareOutputFilesCalls).toBe(1)
      expect(fs.readFileSync(outputPath, 'utf8')).toBe('cached-output')
    }
    finally {
      fs.rmSync(workspaceDir, {recursive: true, force: true})
    }
  })

  it('includes structured diagnostics in JSON output errors', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const command = new JsonOutputCommand({
      name: 'mock',
      async execute(ctx) {
        ctx.logger.error({
          code: 'MOCK_FAILURE',
          title: 'Mock command failed',
          rootCause: ['The mock command was forced to fail for JSON output testing.'],
          exactFix: ['Update the mock command inputs so it no longer emits the test failure.']
        })
        return {
          success: false,
          filesAffected: 0,
          dirsAffected: 0,
          message: 'blocked'
        }
      }
    })

    try {
      await command.execute({
        ...createCommandContext([]),
        logger: createLogger('ProtectedDeletionJsonTest', 'silent')
      })
      expect(writeSpy).toHaveBeenCalledOnce()
      const payload = JSON.parse(String(writeSpy.mock.calls[0]?.[0])) as {
        readonly message?: string
        readonly warnings: readonly unknown[]
        readonly errors: readonly {code: string, title: string, rootCause: readonly string[], copyText: readonly string[]}[]
      }

      expect(payload.message).toBe('blocked')
      expect(payload.warnings).toEqual([])
      expect(payload.errors).toEqual([
        expect.objectContaining({
          code: 'MOCK_FAILURE',
          title: 'Mock command failed',
          rootCause: ['The mock command was forced to fail for JSON output testing.'],
          copyText: expect.arrayContaining(['[MOCK_FAILURE] Mock command failed'])
        })
      ])
    }
    finally {
      writeSpy.mockRestore()
    }
  })
})
