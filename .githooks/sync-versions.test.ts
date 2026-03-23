import {execFileSync} from 'node:child_process'
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {runSyncVersions} from './sync-versions'

function writeJson(filePath: string, value: Record<string, unknown>): void {
  mkdirSync(dirname(filePath), {recursive: true})
  writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf-8')
}

function writeText(filePath: string, content: string): void {
  mkdirSync(dirname(filePath), {recursive: true})
  writeFileSync(filePath, content, 'utf-8')
}

function runGit(rootDir: string, args: readonly string[]): string {
  return execFileSync('git', args, {
    cwd: rootDir,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim()
}

function createFixtureRepo(): string {
  const rootDir = mkdtempSync(join(tmpdir(), 'tnmsc-sync-versions-'))
  const initialVersion = '2026.10324.10015'

  writeJson(join(rootDir, 'package.json'), {
    name: '@truenine/memory-sync',
    version: initialVersion
  })
  writeJson(join(rootDir, 'cli', 'package.json'), {
    name: '@truenine/memory-sync-cli',
    version: initialVersion
  })
  writeJson(join(rootDir, 'cli', 'npm', 'darwin-arm64', 'package.json'), {
    name: '@truenine/memory-sync-cli-darwin-arm64',
    version: initialVersion
  })
  writeJson(join(rootDir, 'libraries', 'logger', 'package.json'), {
    name: '@truenine/logger',
    version: initialVersion
  })
  writeText(join(rootDir, 'Cargo.toml'), [
    '[workspace]',
    'members = ["cli-crate"]',
    '',
    '[workspace.package]',
    `version = "${initialVersion}"`,
    ''
  ].join('\n'))
  writeText(join(rootDir, 'cli-crate', 'Cargo.toml'), [
    '[package]',
    'name = "cli-crate"',
    `version = "${initialVersion}"`,
    ''
  ].join('\n'))
  writeJson(join(rootDir, 'gui', 'src-tauri', 'tauri.conf.json'), {
    version: initialVersion,
    productName: 'Memory Sync'
  })

  runGit(rootDir, ['init'])
  runGit(rootDir, ['config', 'user.email', 'codex@example.com'])
  runGit(rootDir, ['config', 'user.name', 'Codex'])
  runGit(rootDir, ['add', '.'])
  runGit(rootDir, ['commit', '-m', 'initial'])

  return rootDir
}

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    const rootDir = tempDirs.pop()
    if (rootDir != null) {
      rmSync(rootDir, {recursive: true, force: true})
    }
  }
})

describe('sync-versions hook', () => {
  it('uses a staged package.json version as the sync source and stages all propagated changes', () => {
    const rootDir = createFixtureRepo()
    tempDirs.push(rootDir)

    const nextVersion = '2026.10324.10314'
    writeJson(join(rootDir, 'cli', 'npm', 'darwin-arm64', 'package.json'), {
      name: '@truenine/memory-sync-cli-darwin-arm64',
      version: nextVersion
    })
    runGit(rootDir, ['add', 'cli/npm/darwin-arm64/package.json'])

    const result = runSyncVersions({rootDir})
    const stagedFiles = new Set(runGit(rootDir, ['diff', '--cached', '--name-only']).split(/\r?\n/).filter(Boolean))

    expect(result.targetVersion).toBe(nextVersion)
    expect(result.versionSource).toBe('cli/npm/darwin-arm64/package.json')
    expect(JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8')) as {version: string}).toMatchObject({version: nextVersion})
    expect(JSON.parse(readFileSync(join(rootDir, 'cli', 'package.json'), 'utf-8')) as {version: string}).toMatchObject({version: nextVersion})
    expect(JSON.parse(readFileSync(join(rootDir, 'libraries', 'logger', 'package.json'), 'utf-8')) as {version: string}).toMatchObject({version: nextVersion})
    expect(readFileSync(join(rootDir, 'Cargo.toml'), 'utf-8')).toContain(`version = "${nextVersion}"`)
    expect(readFileSync(join(rootDir, 'cli-crate', 'Cargo.toml'), 'utf-8')).toContain(`version = "${nextVersion}"`)
    expect(JSON.parse(readFileSync(join(rootDir, 'gui', 'src-tauri', 'tauri.conf.json'), 'utf-8')) as {version: string}).toMatchObject({version: nextVersion})
    expect(stagedFiles).toEqual(new Set([
      'Cargo.toml',
      'cli-crate/Cargo.toml',
      'cli/npm/darwin-arm64/package.json',
      'cli/package.json',
      'gui/src-tauri/tauri.conf.json',
      'libraries/logger/package.json',
      'package.json'
    ]))
  })

  it('fails when staged package.json files propose conflicting versions', () => {
    const rootDir = createFixtureRepo()
    tempDirs.push(rootDir)

    writeJson(join(rootDir, 'cli', 'npm', 'darwin-arm64', 'package.json'), {
      name: '@truenine/memory-sync-cli-darwin-arm64',
      version: '2026.10324.10314'
    })
    writeJson(join(rootDir, 'libraries', 'logger', 'package.json'), {
      name: '@truenine/logger',
      version: '2026.10324.10315'
    })
    runGit(rootDir, ['add', 'cli/npm/darwin-arm64/package.json', 'libraries/logger/package.json'])

    expect(() => runSyncVersions({rootDir})).toThrowError(/Conflicting staged package\.json versions detected/)
  })
})
