import type {ILogger, OutputCleanContext, OutputCleanupDeclarations, OutputPlugin} from '../src/plugins/plugin-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {performance} from 'node:perf_hooks'
import glob from 'fast-glob'

process.env['TNMSC_FORCE_NATIVE_BINDING'] = '1'
delete process.env['VITEST']
delete process.env['VITEST_WORKER_ID']

const cleanupModule = await import('../src/commands/CleanupUtils')
const fallbackModule = await import('../src/commands/CleanupUtils.fallback')
const pluginCore = await import('../src/plugins/plugin-core')

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

function createCleanContext(workspaceDir: string): OutputCleanContext {
  return {
    logger: createMockLogger(),
    fs,
    path,
    glob,
    collectedOutputContext: {
      workspace: {
        directory: {
          pathKind: pluginCore.FilePathKind.Absolute,
          path: workspaceDir,
          getDirectoryName: () => path.basename(workspaceDir),
          getAbsolutePath: () => workspaceDir
        },
        projects: Array.from({length: 40}, (_, index) => ({
          dirFromWorkspacePath: {
            pathKind: pluginCore.FilePathKind.Relative,
            path: `project-${index}`,
            basePath: workspaceDir,
            getDirectoryName: () => `project-${index}`,
            getAbsolutePath: () => path.join(workspaceDir, `project-${index}`)
          }
        }))
      },
      aindexDir: path.join(workspaceDir, 'aindex')
    }
  } as OutputCleanContext
}

function createBenchmarkPlugin(workspaceDir: string): OutputPlugin {
  return {
    type: pluginCore.PluginKind.Output,
    name: 'BenchmarkOutputPlugin',
    log: createMockLogger(),
    declarativeOutput: true,
    outputCapabilities: {},
    async declareOutputFiles() {
      return Array.from({length: 40}, (_, projectIndex) => ([
        {path: path.join(workspaceDir, `project-${projectIndex}`, 'AGENTS.md'), source: {}},
        {path: path.join(workspaceDir, `project-${projectIndex}`, 'commands', 'AGENTS.md'), source: {}}
      ])).flat()
    },
    async declareCleanupPaths(): Promise<OutputCleanupDeclarations> {
      return {
        delete: [{
          kind: 'glob',
          path: path.join(workspaceDir, '.codex', 'skills', '*'),
          excludeBasenames: ['.system']
        }, {
          kind: 'glob',
          path: path.join(workspaceDir, '.claude', '**', 'CLAUDE.md')
        }],
        protect: [{
          kind: 'directory',
          path: path.join(workspaceDir, '.codex', 'skills', '.system'),
          protectionMode: 'recursive'
        }]
      }
    },
    async convertContent() {
      return 'benchmark'
    }
  }
}

async function measure(label: string, iterations: number, run: () => Promise<void>): Promise<number> {
  const start = performance.now()
  for (let index = 0; index < iterations; index += 1) {
    await run()
  }
  const total = performance.now() - start
  const average = total / iterations
  process.stdout.write(`${label}: total=${total.toFixed(2)}ms avg=${average.toFixed(2)}ms\n`)
  return average
}

async function main(): Promise<void> {
  if (!cleanupModule.hasNativeCleanupBinding()) {
    throw new Error('Native cleanup binding is unavailable. Build the CLI NAPI module first.')
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-benchmark-cleanup-'))
  const workspaceDir = path.join(tempDir, 'workspace')

  try {
    for (let projectIndex = 0; projectIndex < 40; projectIndex += 1) {
      const rootFile = path.join(workspaceDir, `project-${projectIndex}`, 'AGENTS.md')
      const childFile = path.join(workspaceDir, `project-${projectIndex}`, 'commands', 'AGENTS.md')
      fs.mkdirSync(path.dirname(childFile), {recursive: true})
      fs.writeFileSync(rootFile, '# root', 'utf8')
      fs.writeFileSync(childFile, '# child', 'utf8')
    }

    const skillsDir = path.join(workspaceDir, '.codex', 'skills')
    fs.mkdirSync(path.join(skillsDir, '.system'), {recursive: true})
    for (let index = 0; index < 80; index += 1) {
      const skillDir = path.join(skillsDir, `legacy-${index}`)
      fs.mkdirSync(skillDir, {recursive: true})
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# stale', 'utf8')
    }

    for (let index = 0; index < 40; index += 1) {
      const claudeFile = path.join(workspaceDir, '.claude', `project-${index}`, 'CLAUDE.md')
      fs.mkdirSync(path.dirname(claudeFile), {recursive: true})
      fs.writeFileSync(claudeFile, '# claude', 'utf8')
    }

    const plugin = createBenchmarkPlugin(workspaceDir)
    const cleanCtx = createCleanContext(workspaceDir)
    const iterations = 25

    process.stdout.write(`cleanup benchmark iterations=${iterations}\n`)
    const fallbackAvg = await measure('fallback-plan', iterations, async () => {
      await fallbackModule.collectDeletionTargets([plugin], cleanCtx)
    })
    const nativeAvg = await measure('native-plan', iterations, async () => {
      await cleanupModule.collectDeletionTargets([plugin], cleanCtx)
    })

    const delta = nativeAvg - fallbackAvg
    process.stdout.write(`delta=${delta.toFixed(2)}ms (${((delta / fallbackAvg) * 100).toFixed(2)}%)\n`)
  }
  finally {
    fs.rmSync(tempDir, {recursive: true, force: true})
  }
}

await main()
