import type {ILogger, OutputCleanContext, OutputCleanupDeclarations, OutputPlugin} from '../src/plugins/plugin-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import glob from 'fast-glob'

process.env['TNMSC_FORCE_NATIVE_BINDING'] = '1'
delete process.env['VITEST']
delete process.env['VITEST_WORKER_ID']

const cleanupModule = await import('../src/commands/CleanupUtils')
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
        projects: [{
          dirFromWorkspacePath: {
            pathKind: pluginCore.FilePathKind.Relative,
            path: 'project-a',
            basePath: workspaceDir,
            getDirectoryName: () => 'project-a',
            getAbsolutePath: () => path.join(workspaceDir, 'project-a')
          }
        }]
      },
      aindexDir: path.join(workspaceDir, 'aindex')
    }
  } as OutputCleanContext
}

function createSmokePlugin(workspaceDir: string): OutputPlugin {
  return {
    type: pluginCore.PluginKind.Output,
    name: 'SmokeOutputPlugin',
    log: createMockLogger(),
    declarativeOutput: true,
    outputCapabilities: {},
    async declareOutputFiles() {
      return [
        {path: path.join(workspaceDir, 'project-a', 'AGENTS.md'), source: {}},
        {path: path.join(workspaceDir, 'project-a', 'commands', 'AGENTS.md'), source: {}}
      ]
    },
    async declareCleanupPaths(): Promise<OutputCleanupDeclarations> {
      return {
        delete: [{
          kind: 'glob',
          path: path.join(workspaceDir, '.codex', 'skills', '*'),
          excludeBasenames: ['.system']
        }]
      }
    },
    async convertContent() {
      return 'smoke'
    }
  }
}

async function main(): Promise<void> {
  if (!cleanupModule.hasNativeCleanupBinding()) {
    throw new Error('Native cleanup binding is unavailable. Build the CLI NAPI module first.')
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-native-cleanup-smoke-'))
  const workspaceDir = path.join(tempDir, 'workspace')
  const legacySkillDir = path.join(workspaceDir, '.codex', 'skills', 'legacy')
  const preservedSkillDir = path.join(workspaceDir, '.codex', 'skills', '.system')
  const rootOutput = path.join(workspaceDir, 'project-a', 'AGENTS.md')
  const childOutput = path.join(workspaceDir, 'project-a', 'commands', 'AGENTS.md')

  fs.mkdirSync(path.dirname(rootOutput), {recursive: true})
  fs.mkdirSync(path.dirname(childOutput), {recursive: true})
  fs.mkdirSync(legacySkillDir, {recursive: true})
  fs.mkdirSync(preservedSkillDir, {recursive: true})
  fs.writeFileSync(rootOutput, '# root', 'utf8')
  fs.writeFileSync(childOutput, '# child', 'utf8')
  fs.writeFileSync(path.join(legacySkillDir, 'SKILL.md'), '# stale', 'utf8')
  fs.writeFileSync(path.join(preservedSkillDir, 'SKILL.md'), '# keep', 'utf8')

  try {
    const plugin = createSmokePlugin(workspaceDir)
    const cleanCtx = createCleanContext(workspaceDir)

    const nativePlan = await cleanupModule.collectDeletionTargets([plugin], cleanCtx)
    expectSetEqual(nativePlan.filesToDelete, [rootOutput, childOutput], 'native cleanup plan files')
    expectSetEqual(nativePlan.dirsToDelete, [
      legacySkillDir,
      path.join(workspaceDir, 'project-a', 'commands'),
      path.join(workspaceDir, 'project-a')
    ], 'native cleanup plan directories')
    if (nativePlan.violations.length > 0 || nativePlan.conflicts.length > 0) {
      throw new Error(`Unexpected native cleanup plan: ${JSON.stringify(nativePlan, null, 2)}`)
    }

    const result = await cleanupModule.performCleanup([plugin], cleanCtx, createMockLogger())
    if (result.deletedFiles !== 2 || result.deletedDirs !== 3 || result.errors.length > 0) {
      throw new Error(`Unexpected native cleanup result: ${JSON.stringify(result, null, 2)}`)
    }

    if (fs.existsSync(rootOutput) || fs.existsSync(childOutput) || fs.existsSync(legacySkillDir)) {
      throw new Error('Native cleanup did not remove the expected outputs')
    }
    if (!fs.existsSync(preservedSkillDir)) {
      throw new Error('Native cleanup removed the preserved .system skill directory')
    }

    process.stdout.write('cleanup-native-smoke: ok\n')
  }
  finally {
    fs.rmSync(tempDir, {recursive: true, force: true})
  }
}

function expectSetEqual(actual: readonly string[], expected: readonly string[], label: string): void {
  const actualSorted = [...actual].sort()
  const expectedSorted = [...expected].sort()
  if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
    throw new Error(`Unexpected ${label}: ${JSON.stringify(actualSorted)} !== ${JSON.stringify(expectedSorted)}`)
  }
}

await main()
