import type {OutputPlugin, OutputWriteContext} from './plugin'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {PluginKind} from './enums'
import {executeDeclarativeWriteOutputs} from './plugin'

function createOutputPlugin(outputPath: string): OutputPlugin {
  return {
    name: 'TestOutputPlugin',
    type: PluginKind.Output,
    log: {
      trace: () => {},
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      fatal: () => {}
    },
    declarativeOutput: true,
    outputCapabilities: {},
    async declareOutputFiles() {
      return [{
        path: outputPath,
        scope: 'project',
        source: {kind: 'projectRootMemory', content: 'hello'}
      }]
    },
    async convertContent() {
      return 'hello'
    }
  }
}

function createWriteContext(workspaceDir: string): OutputWriteContext {
  return {
    logger: {
      trace: () => {},
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      fatal: () => {}
    },
    collectedOutputContext: {
      workspace: {
        directory: {
          pathKind: 'absolute',
          path: workspaceDir,
          getDirectoryName: () => path.basename(workspaceDir)
        },
        projects: []
      }
    },
    pluginOptions: {workspaceDir} as OutputWriteContext['pluginOptions'],
    runtimeTargets: {
      jetbrainsCodexDirs: []
    },
    executionPlan: {
      scope: 'workspace',
      cwd: workspaceDir,
      workspaceDir,
      projectsBySeries: {
        app: [],
        ext: [],
        arch: [],
        softwares: []
      }
    }
  }
}

describe('executeDeclarativeWriteOutputs', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const tempDir of tempDirs) {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
    tempDirs.length = 0
  })

  it('removes blocking files and continues writing', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-plugin-write-'))
    tempDirs.push(tempDir)

    const blockingFilePath = path.join(tempDir, '.codex')
    fs.writeFileSync(blockingFilePath, '', 'utf8')

    const outputPath = path.join(tempDir, '.codex', 'skills', 'demo', 'SKILL.md')
    const plugin = createOutputPlugin(outputPath)
    const results = await executeDeclarativeWriteOutputs([plugin], createWriteContext(tempDir))
    const fileResult = results.get(plugin.name)?.files[0]

    expect(fileResult?.success).toBe(true)
    expect(fs.statSync(blockingFilePath).isDirectory()).toBe(true)
    expect(fs.readFileSync(outputPath, 'utf8')).toBe('hello')
  })
})
