import type {ILogger, OutputCleanContext, OutputPlugin} from '../plugins/plugin-core'
import * as fs from 'node:fs'
import * as path from 'node:path'
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
    glob: {} as never,
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

function createMockOutputPlugin(name: string, outputs: readonly string[]): OutputPlugin {
  return {
    type: PluginKind.Output,
    name,
    log: createMockLogger(),
    declarativeOutput: true,
    outputCapabilities: {},
    async declareOutputFiles() {
      return outputs.map(output => ({path: output, source: {}}))
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
    expect(new Set(result.protectedFiles)).toEqual(new Set([editorSource, ignoreSource]))
  })

  it('keeps non-overlapping output paths for cleanup', async () => {
    const outputA = path.resolve('tmp-out/a.md')
    const outputB = path.resolve('tmp-out/b.md')
    const ctx = createCleanContext()
    const plugin = createMockOutputPlugin('MockOutputPlugin', [outputA, outputB])

    const result = await collectDeletionTargets([plugin], ctx)

    expect(new Set(result.filesToDelete)).toEqual(new Set([outputA, outputB]))
    expect(result.protectedFiles).toEqual([])
  })
})
