import type {ILogger, OutputCleanContext, OutputCleanupDeclarations, OutputPlugin} from '../plugins/plugin-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import glob from 'fast-glob'
import {describe, expect, it} from 'vitest'
import {
  FilePathKind,
  IDEKind,
  PluginKind
} from '../plugins/plugin-core'
import {collectDeletionTargets} from './CleanupUtils'

function createMockLogger(): ILogger {
  return {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {}
  } as ILogger
}

function createCleanContext(overrides?: Partial<OutputCleanContext['collectedOutputContext']>): OutputCleanContext {
  return {
    logger: createMockLogger(),
    fs,
    path,
    glob,
    dryRun: true,
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
      },
      ...overrides
    }
  } as OutputCleanContext
}

function createMockOutputPlugin(name: string, outputs: readonly string[], cleanup?: OutputCleanupDeclarations): OutputPlugin {
  return {
    type: PluginKind.Output,
    name,
    log: createMockLogger(),
    declarativeOutput: true,
    outputCapabilities: {},
    async declareOutputFiles() {
      return outputs.map(output => ({path: output, source: {}}))
    },
    async declareCleanupPaths() {
      return cleanup ?? {}
    },
    async convertContent() {
      return ''
    }
  }
}

describe('collectDeletionTargets', () => {
  it('skips deletion for paths that overlap with input source files', async () => {
    const editorSource = path.resolve('tmp-aindex/.editorconfig')
    const ignoreSource = path.resolve('tmp-aindex/.cursorignore')
    const safeOutput = path.resolve('tmp-out/AGENTS.md')

    const ctx = createCleanContext({
      editorConfigFiles: [{
        type: IDEKind.EditorConfig,
        content: 'root = true',
        length: 11,
        filePathKind: FilePathKind.Absolute,
        dir: {
          pathKind: FilePathKind.Absolute,
          path: editorSource,
          getDirectoryName: () => '.editorconfig'
        }
      }],
      aiAgentIgnoreConfigFiles: [{
        fileName: '.cursorignore',
        content: 'node_modules',
        sourcePath: ignoreSource
      }]
    })

    const plugin = createMockOutputPlugin('MockOutputPlugin', [
      editorSource,
      ignoreSource,
      safeOutput
    ])

    const result = await collectDeletionTargets([plugin], ctx)

    expect(result.filesToDelete).toEqual([safeOutput])
    expect(new Set(result.violations.map(violation => violation.targetPath))).toEqual(new Set([editorSource, ignoreSource]))
  })

  it('keeps non-overlapping output paths for cleanup', async () => {
    const outputA = path.resolve('tmp-out/a.md')
    const outputB = path.resolve('tmp-out/b.md')
    const ctx = createCleanContext()
    const plugin = createMockOutputPlugin('MockOutputPlugin', [outputA, outputB])

    const result = await collectDeletionTargets([plugin], ctx)

    expect(new Set(result.filesToDelete)).toEqual(new Set([outputA, outputB]))
    expect(result.violations).toEqual([])
  })

  it('protects known aindex input config files by aindexDir fallback', async () => {
    const aindexDir = path.resolve('tmp-aindex')
    const editorConfigOutput = path.resolve(aindexDir, '.editorconfig')
    const safeOutput = path.resolve('tmp-out/c.md')
    const ctx = createCleanContext({aindexDir})
    const plugin = createMockOutputPlugin('MockOutputPlugin', [editorConfigOutput, safeOutput])

    const result = await collectDeletionTargets([plugin], ctx)

    expect(result.filesToDelete).toEqual([safeOutput])
    expect(result.violations.map(violation => violation.targetPath)).toEqual([editorConfigOutput])
  })

  it('compacts nested delete targets to reduce IO', async () => {
    const claudeBaseDir = path.resolve('tmp-out/.claude')
    const ruleDir = path.join(claudeBaseDir, 'rules')
    const ruleFile = path.join(ruleDir, 'a.md')
    const ctx = createCleanContext()
    const plugin = createMockOutputPlugin(
      'MockOutputPlugin',
      [ruleFile],
      {
        delete: [
          {kind: 'directory', path: claudeBaseDir},
          {kind: 'directory', path: ruleDir},
          {kind: 'file', path: ruleFile}
        ]
      }
    )

    const result = await collectDeletionTargets([plugin], ctx)

    expect(result.dirsToDelete).toEqual([claudeBaseDir])
    expect(result.filesToDelete).toEqual([])
  })

  it('skips parent deletion when a protected child path exists', async () => {
    const codexBaseDir = path.resolve('tmp-out/.codex')
    const promptsDir = path.join(codexBaseDir, 'prompts')
    const protectedSystemDir = path.join(codexBaseDir, 'skills', '.system')
    const ctx = createCleanContext()
    const plugin = createMockOutputPlugin(
      'MockOutputPlugin',
      [],
      {
        delete: [
          {kind: 'directory', path: codexBaseDir},
          {kind: 'directory', path: promptsDir}
        ],
        protect: [
          {kind: 'directory', path: protectedSystemDir}
        ]
      }
    )

    const result = await collectDeletionTargets([plugin], ctx)

    expect(result.dirsToDelete).toEqual([promptsDir])
    expect(result.violations.map(violation => violation.targetPath)).toEqual([codexBaseDir])
  })

  it('blocks exact protected paths like home directory', async () => {
    const homeDir = os.homedir()
    const ctx = createCleanContext()
    const plugin = createMockOutputPlugin(
      'MockOutputPlugin',
      [],
      {
        delete: [{kind: 'directory', path: homeDir}]
      }
    )

    const result = await collectDeletionTargets([plugin], ctx)

    expect(result.dirsToDelete).toEqual([])
    expect(result.filesToDelete).toEqual([])
    expect(result.violations).toEqual([expect.objectContaining({
      targetPath: path.resolve(homeDir),
      protection: 'exact'
    })])
  })

  it('blocks exact protected paths like ~/.aindex, ~/.aindex/.tnmsc.json, workspace root, project root, and aindex root', async () => {
    const workspaceDir = path.resolve('tmp-workspace-root')
    const projectRoot = path.join(workspaceDir, 'project-a')
    const aindexDir = path.join(workspaceDir, 'aindex')
    const globalAindexDir = path.join(os.homedir(), '.aindex')
    const globalConfigPath = path.join(globalAindexDir, '.tnmsc.json')
    const ctx = createCleanContext({
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
            getAbsolutePath: () => projectRoot
          }
        }]
      },
      aindexDir
    })
    const plugin = createMockOutputPlugin(
      'MockOutputPlugin',
      [globalConfigPath],
      {
        delete: [
          {kind: 'directory', path: globalAindexDir},
          {kind: 'directory', path: workspaceDir},
          {kind: 'directory', path: projectRoot},
          {kind: 'directory', path: aindexDir}
        ]
      }
    )

    const result = await collectDeletionTargets([plugin], ctx)

    expect(result.filesToDelete).toEqual([])
    expect(result.dirsToDelete).toEqual([])
    expect(new Set(result.violations.map(violation => violation.targetPath))).toEqual(new Set([
      path.resolve(globalAindexDir),
      path.resolve(globalConfigPath),
      path.resolve(workspaceDir),
      path.resolve(projectRoot),
      path.resolve(aindexDir)
    ]))
  })

  it('allows deleting children under exact protected roots', async () => {
    const globalChildDir = path.join(os.homedir(), '.aindex', '.codex', 'prompts')
    const workspaceDir = path.resolve('tmp-workspace-root-safe')
    const projectChildFile = path.join(workspaceDir, 'project-a', 'AGENTS.md')
    const aindexChildDir = path.join(workspaceDir, 'aindex', 'dist', 'commands')
    const ctx = createCleanContext({
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
      aindexDir: path.join(workspaceDir, 'aindex')
    })
    const plugin = createMockOutputPlugin('MockOutputPlugin', [projectChildFile], {
      delete: [
        {kind: 'directory', path: globalChildDir},
        {kind: 'directory', path: aindexChildDir}
      ]
    })

    const result = await collectDeletionTargets([plugin], ctx)

    expect(new Set(result.filesToDelete)).toEqual(new Set([path.resolve(projectChildFile)]))
    expect(new Set(result.dirsToDelete)).toEqual(new Set([path.resolve(globalChildDir), path.resolve(aindexChildDir)]))
    expect(result.violations).toEqual([])
  })

  it('blocks symlink targets that resolve to an exact protected path', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-cleanup-guard-'))
    const workspaceDir = path.join(tempDir, 'workspace')
    const symlinkPath = path.join(tempDir, 'workspace-link')

    fs.mkdirSync(workspaceDir, {recursive: true})

    try {
      const symlinkType: 'junction' | 'dir' = process.platform === 'win32' ? 'junction' : 'dir'
      fs.symlinkSync(workspaceDir, symlinkPath, symlinkType)

      const ctx = createCleanContext({
        workspace: {
          directory: {
            pathKind: FilePathKind.Absolute,
            path: workspaceDir,
            getDirectoryName: () => path.basename(workspaceDir),
            getAbsolutePath: () => workspaceDir
          },
          projects: []
        }
      })
      const plugin = createMockOutputPlugin('MockOutputPlugin', [], {
        delete: [{kind: 'directory', path: symlinkPath}]
      })

      const result = await collectDeletionTargets([plugin], ctx)

      expect(result.dirsToDelete).toEqual([])
      expect(result.violations).toEqual([expect.objectContaining({
        targetPath: path.resolve(symlinkPath),
        protection: 'exact'
      })])
    }
    finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })
})
