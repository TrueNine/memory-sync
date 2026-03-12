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
    pluginOptions: {cleanupProtection: {}},
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
  it('throws when an output path matches a protected input source file', async () => {
    const editorSource = path.resolve('tmp-aindex/public/.editorconfig')
    const ignoreSource = path.resolve('tmp-aindex/public/.cursorignore')

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

    const plugin = createMockOutputPlugin('MockOutputPlugin', [editorSource, ignoreSource])

    await expect(collectDeletionTargets([plugin], ctx)).rejects.toThrow('Cleanup protection conflict')
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

  it('throws when an output path matches a known aindex protected config file', async () => {
    const aindexDir = path.resolve('tmp-aindex')
    const editorConfigOutput = path.resolve(aindexDir, 'public', '.editorconfig')
    const ctx = createCleanContext({aindexDir})
    const plugin = createMockOutputPlugin('MockOutputPlugin', [editorConfigOutput])

    await expect(collectDeletionTargets([plugin], ctx)).rejects.toThrow('Cleanup protection conflict')
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

  it('blocks deleting dangerous roots and returns the most specific matching rule', async () => {
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
      protectedPath: path.resolve('knowladge'),
      protectionMode: 'direct'
    })])
  })

  it('throws when an output path matches a built-in protected path before directory guards run', async () => {
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

    await expect(collectDeletionTargets([plugin], ctx)).rejects.toThrow(`Cleanup protection conflict: 1 output path(s) are also protected: ${path.resolve(globalConfigPath)}`)
  })

  it('allows deleting non-mdx files under dist while blocking reserved dist mdx files', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-cleanup-dist-mdx-'))
    const workspaceDir = path.join(tempDir, 'workspace')
    const distCommandDir = path.join(workspaceDir, 'aindex', 'dist', 'commands')
    const projectChildFile = path.join(workspaceDir, 'project-a', 'AGENTS.md')
    const protectedDistMdxFile = path.join(distCommandDir, 'demo.mdx')
    const safeDistMarkdownFile = path.join(distCommandDir, 'README.md')
    const globalChildDir = path.join(os.homedir(), '.aindex', '.codex', 'prompts')
    const aindexSourceDir = path.join(workspaceDir, 'aindex', 'commands')

    fs.mkdirSync(path.dirname(projectChildFile), {recursive: true})
    fs.mkdirSync(distCommandDir, {recursive: true})
    fs.mkdirSync(aindexSourceDir, {recursive: true})
    fs.writeFileSync(projectChildFile, '# agent', 'utf8')
    fs.writeFileSync(protectedDistMdxFile, '# compiled', 'utf8')
    fs.writeFileSync(safeDistMarkdownFile, '# doc', 'utf8')

    try {
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
      const plugin = createMockOutputPlugin('MockOutputPlugin', [
        projectChildFile,
        safeDistMarkdownFile
      ], {
        delete: [
          {kind: 'file', path: protectedDistMdxFile},
          {kind: 'directory', path: globalChildDir},
          {kind: 'directory', path: aindexSourceDir}
        ]
      })

      const result = await collectDeletionTargets([plugin], ctx)

      expect(new Set(result.filesToDelete)).toEqual(new Set([
        path.resolve(projectChildFile),
        path.resolve(safeDistMarkdownFile)
      ]))
      expect(new Set(result.dirsToDelete)).toEqual(new Set([path.resolve(globalChildDir), path.resolve(aindexSourceDir)]))
      expect(result.violations).toEqual([expect.objectContaining({
        targetPath: path.resolve(protectedDistMdxFile),
        protectionMode: 'direct',
        protectedPath: path.resolve(protectedDistMdxFile)
      })])
    }
    finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })

  it('blocks deleting a dist directory when protected mdx descendants exist', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-cleanup-dist-dir-'))
    const workspaceDir = path.join(tempDir, 'workspace')
    const distCommandDir = path.join(workspaceDir, 'aindex', 'dist', 'commands')
    const protectedDistMdxFile = path.join(distCommandDir, 'demo.mdx')

    fs.mkdirSync(distCommandDir, {recursive: true})
    fs.writeFileSync(protectedDistMdxFile, '# compiled', 'utf8')

    try {
      const ctx = createCleanContext({
        workspace: {
          directory: {
            pathKind: FilePathKind.Absolute,
            path: workspaceDir,
            getDirectoryName: () => path.basename(workspaceDir),
            getAbsolutePath: () => workspaceDir
          },
          projects: []
        },
        aindexDir: path.join(workspaceDir, 'aindex')
      })
      const plugin = createMockOutputPlugin('MockOutputPlugin', [], {
        delete: [{kind: 'directory', path: distCommandDir}]
      })

      const result = await collectDeletionTargets([plugin], ctx)

      expect(result.dirsToDelete).toEqual([])
      expect(result.filesToDelete).toEqual([])
      expect(result.violations).toEqual([expect.objectContaining({
        targetPath: path.resolve(distCommandDir),
        protectionMode: 'direct',
        protectedPath: path.resolve(protectedDistMdxFile)
      })])
    }
    finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })

  it('allows deleting non-mdx files under app while blocking reserved app mdx files', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-cleanup-app-mdx-'))
    const workspaceDir = path.join(tempDir, 'workspace')
    const appDir = path.join(workspaceDir, 'aindex', 'app')
    const protectedAppMdxFile = path.join(appDir, 'guide.mdx')
    const safeAppMarkdownFile = path.join(appDir, 'README.md')

    fs.mkdirSync(appDir, {recursive: true})
    fs.writeFileSync(protectedAppMdxFile, '# app guide', 'utf8')
    fs.writeFileSync(safeAppMarkdownFile, '# readme', 'utf8')

    try {
      const ctx = createCleanContext({
        workspace: {
          directory: {
            pathKind: FilePathKind.Absolute,
            path: workspaceDir,
            getDirectoryName: () => path.basename(workspaceDir),
            getAbsolutePath: () => workspaceDir
          },
          projects: []
        },
        aindexDir: path.join(workspaceDir, 'aindex')
      })
      const plugin = createMockOutputPlugin('MockOutputPlugin', [safeAppMarkdownFile], {
        delete: [{kind: 'file', path: protectedAppMdxFile}]
      })

      const result = await collectDeletionTargets([plugin], ctx)

      expect(result.filesToDelete).toEqual([path.resolve(safeAppMarkdownFile)])
      expect(result.violations).toEqual([expect.objectContaining({
        targetPath: path.resolve(protectedAppMdxFile),
        protectionMode: 'direct',
        protectedPath: path.resolve(protectedAppMdxFile)
      })])
    }
    finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })

  it('throws when an output file path exactly matches a cleanup protect declaration', async () => {
    const outputPath = path.resolve('tmp-out/protected.md')
    const ctx = createCleanContext()
    const plugin = createMockOutputPlugin('MockOutputPlugin', [outputPath], {
      protect: [{kind: 'file', path: outputPath}]
    })

    await expect(collectDeletionTargets([plugin], ctx)).rejects.toThrow('Cleanup protection conflict')
  })

  it('blocks deleting an app directory when protected mdx descendants exist', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-cleanup-app-dir-'))
    const workspaceDir = path.join(tempDir, 'workspace')
    const appSubDir = path.join(workspaceDir, 'aindex', 'app', 'nested')
    const protectedAppMdxFile = path.join(appSubDir, 'guide.mdx')

    fs.mkdirSync(appSubDir, {recursive: true})
    fs.writeFileSync(protectedAppMdxFile, '# app guide', 'utf8')

    try {
      const ctx = createCleanContext({
        workspace: {
          directory: {
            pathKind: FilePathKind.Absolute,
            path: workspaceDir,
            getDirectoryName: () => path.basename(workspaceDir),
            getAbsolutePath: () => workspaceDir
          },
          projects: []
        },
        aindexDir: path.join(workspaceDir, 'aindex')
      })
      const plugin = createMockOutputPlugin('MockOutputPlugin', [], {
        delete: [{kind: 'directory', path: path.join(workspaceDir, 'aindex', 'app')}]
      })

      const result = await collectDeletionTargets([plugin], ctx)

      expect(result.dirsToDelete).toEqual([])
      expect(result.filesToDelete).toEqual([])
      expect(result.violations).toEqual([expect.objectContaining({
        targetPath: path.resolve(path.join(workspaceDir, 'aindex', 'app')),
        protectionMode: 'direct',
        protectedPath: path.resolve(protectedAppMdxFile)
      })])
    }
    finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })

  it('blocks symlink targets that resolve to a protected path and keeps the most specific match', async () => {
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
        protectedPath: path.resolve(path.join(workspaceDir, 'knowladge')),
        protectionMode: 'direct'
      })])
    }
    finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })

  it('lets direct protect declarations keep descendants deletable while recursive protect declarations block them', async () => {
    const workspaceDir = path.resolve('tmp-direct-vs-recursive')
    const directProtectedDir = path.join(workspaceDir, 'project-a')
    const recursiveProtectedDir = path.join(workspaceDir, 'aindex', 'dist')
    const directChildFile = path.join(directProtectedDir, 'AGENTS.md')
    const recursiveChildFile = path.join(recursiveProtectedDir, 'commands', 'demo.mdx')
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
    const plugin = createMockOutputPlugin('MockOutputPlugin', [directChildFile, recursiveChildFile], {
      protect: [
        {kind: 'directory', path: directProtectedDir, protectionMode: 'direct'},
        {kind: 'directory', path: recursiveProtectedDir, protectionMode: 'recursive'}
      ]
    })

    const result = await collectDeletionTargets([plugin], ctx)

    expect(result.filesToDelete).toEqual([path.resolve(directChildFile)])
    expect(result.violations).toEqual([expect.objectContaining({
      targetPath: path.resolve(recursiveChildFile),
      protectionMode: 'recursive',
      protectedPath: path.resolve(recursiveProtectedDir)
    })])
  })

  it('skips delete glob matches covered by excludeScanGlobs while still deleting other sibling directories', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-cleanup-exclude-glob-'))
    const skillsDir = path.join(tempDir, '.cursor', 'skills-cursor')
    const preservedDir = path.join(skillsDir, 'create-rule')
    const staleDir = path.join(skillsDir, 'legacy-skill')

    fs.mkdirSync(preservedDir, {recursive: true})
    fs.mkdirSync(staleDir, {recursive: true})
    fs.writeFileSync(path.join(preservedDir, 'SKILL.md'), '# preserved', 'utf8')
    fs.writeFileSync(path.join(staleDir, 'SKILL.md'), '# stale', 'utf8')

    try {
      const ctx = createCleanContext()
      const plugin = createMockOutputPlugin('MockOutputPlugin', [], {
        delete: [{kind: 'glob', path: path.join(skillsDir, '*')}],
        protect: [{kind: 'directory', path: preservedDir}],
        excludeScanGlobs: [preservedDir, path.join(preservedDir, '**')]
      })

      const result = await collectDeletionTargets([plugin], ctx)

      expect(result.dirsToDelete).toEqual([path.resolve(staleDir)])
      expect(result.filesToDelete).toEqual([])
      expect(result.violations).toEqual([])
    }
    finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })
})
