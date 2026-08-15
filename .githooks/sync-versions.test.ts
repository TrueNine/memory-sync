import {execFileSync} from 'node:child_process'
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {afterEach, describe, expect, it} from 'bun:test'
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
    name: '@truenine/croessweave',
    version: initialVersion
  })
  writeJson(join(rootDir, 'cli', 'package.json'), {
    name: '@truenine/croessweave-cli',
    version: initialVersion,
    optionalDependencies: {
      '@truenine/croessweave-cli-darwin-arm64': initialVersion,
      '@truenine/croessweave-cli-linux-x64-gnu': initialVersion
    }
  })
  writeJson(join(rootDir, 'mcp', 'package.json'), {
    name: '@truenine/croessweave-mcp',
    version: initialVersion,
    optionalDependencies: {
      '@truenine/croessweave-mcp-darwin-arm64': initialVersion,
      '@truenine/croessweave-mcp-linux-x64-gnu': initialVersion
    }
  })
  writeJson(join(rootDir, 'gui', 'package.json'), {
    name: '@truenine/croessweave-gui',
    version: initialVersion
  })
  writeJson(join(rootDir, 'doc', 'package.json'), {
    name: '@truenine/croessweave-docs',
    version: initialVersion,
    private: true
  })
  writeJson(join(rootDir, 'tnmsop', 'package.json'), {
    name: 'tnmsop',
    version: initialVersion,
    private: true
  })
  const manifest = {
    id: 'tnmsop',
    name: 'TNMSOP',
    version: initialVersion,
    minAppVersion: '1.0.0',
    isDesktopOnly: false
  }
  writeJson(join(rootDir, 'tnmsop', 'manifest.json'), manifest)
  writeJson(join(rootDir, 'manifest.json'), manifest)
  writeJson(join(rootDir, 'tnmsop', 'versions.json'), {[initialVersion]: '1.0.0'})
  writeJson(join(rootDir, 'versions.json'), {[initialVersion]: '1.0.0'})
  writeJson(join(rootDir, 'cli', 'npm', 'darwin-arm64', 'package.json'), {
    name: '@truenine/croessweave-cli-darwin-arm64',
    version: initialVersion
  })
  writeJson(join(rootDir, 'cli', 'npm', 'linux-x64-gnu', 'package.json'), {
    name: '@truenine/croessweave-cli-linux-x64-gnu',
    version: initialVersion
  })

  writeText(join(rootDir, 'Cargo.toml'), [
    '[workspace]',
    'members = ["sdk", "cli", "mcp", "gui/src-tauri"]',
    '',
    '[workspace.package]',
    `version = "${initialVersion}"`,
    ''
  ].join('\n'))
  writeText(join(rootDir, 'sdk', 'Cargo.toml'), [
    '[package]',
    'name = "tnmsd"',
    'version.workspace = true',
    ''
  ].join('\n'))
  writeText(join(rootDir, 'cli', 'Cargo.toml'), [
    '[package]',
    'name = "tnmsc"',
    'version.workspace = true',
    ''
  ].join('\n'))
  writeText(join(rootDir, 'mcp', 'Cargo.toml'), [
    '[package]',
    'name = "tnmsm"',
    'version.workspace = true',
    ''
  ].join('\n'))
  writeText(join(rootDir, 'gui', 'src-tauri', 'Cargo.toml'), [
    '[package]',
    'name = "croessweave-gui"',
    `version = "${initialVersion}"`,
    ''
  ].join('\n'))
  writeJson(join(rootDir, 'gui', 'src-tauri', 'tauri.conf.json'), {
    version: initialVersion,
    productName: 'Croessweave'
  })
  writeText(join(rootDir, 'Cargo.lock'), [
    'version = 4',
    '',
    '[[package]]',
    'name = "tnmsd"',
    `version = "${initialVersion}"`,
    '',
    '[[package]]',
    'name = "tnmsc"',
    `version = "${initialVersion}"`,
    '',
    '[[package]]',
    'name = "tnmsm"',
    `version = "${initialVersion}"`,
    '',
    '[[package]]',
    'name = "croessweave-gui"',
    `version = "${initialVersion}"`,
    ''
  ].join('\n'))

  runGit(rootDir, ['init'])
  runGit(rootDir, ['config', 'user.email', 'codex@example.com'])
  runGit(rootDir, ['config', 'user.name', 'Codex'])
  runGit(rootDir, ['add', '.'])
  runGit(rootDir, ['commit', '-m', 'initial'])

  return rootDir
}

function preparePluginRelease(rootDir: string, nextVersion: string): void {
  writeJson(join(rootDir, 'tnmsop', 'package.json'), {
    name: 'tnmsop',
    version: nextVersion,
    private: true
  })
  writeJson(join(rootDir, 'tnmsop', 'manifest.json'), {
    id: 'tnmsop',
    name: 'TNMSOP',
    version: nextVersion,
    minAppVersion: '1.0.0',
    isDesktopOnly: false
  })
  writeJson(join(rootDir, 'tnmsop', 'versions.json'), {
    '2026.10324.10015': '1.0.0',
    [nextVersion]: '1.0.0'
  })
}

function expectSharedVersionSurfaces(rootDir: string, nextVersion: string): void {
  expect(JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8')) as {version: string}).toMatchObject({version: nextVersion})
  expect(JSON.parse(readFileSync(join(rootDir, 'cli', 'package.json'), 'utf-8')) as {version: string, optionalDependencies: Record<string, string>}).toMatchObject({
    version: nextVersion,
    optionalDependencies: {
      '@truenine/croessweave-cli-darwin-arm64': nextVersion,
      '@truenine/croessweave-cli-linux-x64-gnu': nextVersion
    }
  })
  expect(JSON.parse(readFileSync(join(rootDir, 'mcp', 'package.json'), 'utf-8')) as {version: string, optionalDependencies: Record<string, string>}).toMatchObject({
    version: nextVersion,
    optionalDependencies: {
      '@truenine/croessweave-mcp-darwin-arm64': nextVersion,
      '@truenine/croessweave-mcp-linux-x64-gnu': nextVersion
    }
  })
  expect(JSON.parse(readFileSync(join(rootDir, 'gui', 'package.json'), 'utf-8')) as {version: string}).toMatchObject({version: nextVersion})
  expect(JSON.parse(readFileSync(join(rootDir, 'doc', 'package.json'), 'utf-8')) as {version: string}).toMatchObject({version: nextVersion})
  expect(JSON.parse(readFileSync(join(rootDir, 'tnmsop', 'package.json'), 'utf-8')) as {version: string}).toMatchObject({version: nextVersion})
  const pluginManifest = JSON.parse(readFileSync(join(rootDir, 'tnmsop', 'manifest.json'), 'utf-8')) as {version: string, minAppVersion: string}
  expect(pluginManifest).toMatchObject({version: nextVersion, minAppVersion: '1.0.0'})
  expect(JSON.parse(readFileSync(join(rootDir, 'manifest.json'), 'utf-8'))).toEqual(pluginManifest)
  expect(JSON.parse(readFileSync(join(rootDir, 'tnmsop', 'versions.json'), 'utf-8'))).toMatchObject({[nextVersion]: '1.0.0'})
  expect(JSON.parse(readFileSync(join(rootDir, 'versions.json'), 'utf-8'))).toEqual(
    JSON.parse(readFileSync(join(rootDir, 'tnmsop', 'versions.json'), 'utf-8'))
  )
  expect(JSON.parse(readFileSync(join(rootDir, 'cli', 'npm', 'darwin-arm64', 'package.json'), 'utf-8')) as {version: string}).toMatchObject({version: nextVersion})
  expect(JSON.parse(readFileSync(join(rootDir, 'cli', 'npm', 'linux-x64-gnu', 'package.json'), 'utf-8')) as {version: string}).toMatchObject({version: nextVersion})
  expect(readFileSync(join(rootDir, 'Cargo.toml'), 'utf-8')).toContain(`version = "${nextVersion}"`)
  expect(readFileSync(join(rootDir, 'gui', 'src-tauri', 'Cargo.toml'), 'utf-8')).toContain(`version = "${nextVersion}"`)
  expect(JSON.parse(readFileSync(join(rootDir, 'gui', 'src-tauri', 'tauri.conf.json'), 'utf-8')) as {version: string}).toMatchObject({version: nextVersion})
  expect(readFileSync(join(rootDir, 'Cargo.lock'), 'utf-8')).toContain(`version = "${nextVersion}"`)
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
  it('uses a staged platform package version as the sync source and stages propagated changes', () => {
    const rootDir = createFixtureRepo()
    tempDirs.push(rootDir)

    const nextVersion = '2026.10324.10314'
    preparePluginRelease(rootDir, nextVersion)
    writeJson(join(rootDir, 'cli', 'npm', 'darwin-arm64', 'package.json'), {
      name: '@truenine/croessweave-cli-darwin-arm64',
      version: nextVersion
    })
    runGit(rootDir, ['add', 'cli/npm/darwin-arm64/package.json'])

    const result = runSyncVersions({rootDir})
    const stagedFiles = new Set(runGit(rootDir, ['diff', '--cached', '--name-only']).split(/\r?\n/).filter(Boolean))

    expect(result.targetVersion).toBe(nextVersion)
    expect(result.versionSource).toBe('cli/npm/darwin-arm64/package.json')
    expectSharedVersionSurfaces(rootDir, nextVersion)
    expect(stagedFiles).toEqual(new Set([
      'Cargo.lock',
      'Cargo.toml',
      'cli/npm/darwin-arm64/package.json',
      'cli/npm/linux-x64-gnu/package.json',
      'cli/package.json',
      'doc/package.json',
      'gui/package.json',
      'gui/src-tauri/Cargo.toml',
      'gui/src-tauri/tauri.conf.json',
      'mcp/package.json',
      'manifest.json',
      'package.json',
      'versions.json'
    ]))
  })

  it('accepts gui/package.json as a staged version source and propagates it', () => {
    const rootDir = createFixtureRepo()
    tempDirs.push(rootDir)

    const nextVersion = '2026.10324.10316'
    preparePluginRelease(rootDir, nextVersion)
    writeJson(join(rootDir, 'gui', 'package.json'), {
      name: '@truenine/croessweave-gui',
      version: nextVersion
    })
    runGit(rootDir, ['add', 'gui/package.json'])

    const result = runSyncVersions({rootDir})
    const stagedFiles = new Set(runGit(rootDir, ['diff', '--cached', '--name-only']).split(/\r?\n/).filter(Boolean))

    expect(result.targetVersion).toBe(nextVersion)
    expect(result.versionSource).toBe('gui/package.json')
    expectSharedVersionSurfaces(rootDir, nextVersion)
    expect(stagedFiles).toEqual(new Set([
      'Cargo.lock',
      'Cargo.toml',
      'cli/npm/darwin-arm64/package.json',
      'cli/npm/linux-x64-gnu/package.json',
      'cli/package.json',
      'doc/package.json',
      'gui/package.json',
      'gui/src-tauri/Cargo.toml',
      'gui/src-tauri/tauri.conf.json',
      'mcp/package.json',
      'manifest.json',
      'package.json',
      'versions.json'
    ]))
  })

  it('accepts doc/package.json as a staged version source and propagates it', () => {
    const rootDir = createFixtureRepo()
    tempDirs.push(rootDir)

    const nextVersion = '2026.10324.10318'
    preparePluginRelease(rootDir, nextVersion)
    writeJson(join(rootDir, 'doc', 'package.json'), {
      name: '@truenine/croessweave-docs',
      version: nextVersion,
      private: true
    })
    runGit(rootDir, ['add', 'doc/package.json'])

    const result = runSyncVersions({rootDir})

    expect(result.targetVersion).toBe(nextVersion)
    expect(result.versionSource).toBe('doc/package.json')
    expectSharedVersionSurfaces(rootDir, nextVersion)
  })

  it('requires TNMSOP to be released before the system version advances', () => {
    const rootDir = createFixtureRepo()
    tempDirs.push(rootDir)

    const nextVersion = '2026.10324.10319'
    writeJson(join(rootDir, 'doc', 'package.json'), {
      name: '@truenine/croessweave-docs',
      version: nextVersion,
      private: true
    })
    runGit(rootDir, ['add', 'doc/package.json'])

    expect(() => runSyncVersions({rootDir})).toThrowError(/release TNMSOP first/)
  })

  it('fails when staged package.json files propose conflicting versions', () => {
    const rootDir = createFixtureRepo()
    tempDirs.push(rootDir)

    writeJson(join(rootDir, 'cli', 'npm', 'darwin-arm64', 'package.json'), {
      name: '@truenine/croessweave-cli-darwin-arm64',
      version: '2026.10324.10314'
    })
    writeJson(join(rootDir, 'doc', 'package.json'), {
      name: '@truenine/croessweave-docs',
      version: '2026.10324.10315',
      private: true
    })
    runGit(rootDir, ['add', 'cli/npm/darwin-arm64/package.json', 'doc/package.json'])

    expect(() => runSyncVersions({rootDir})).toThrowError(/Conflicting staged package\.json versions detected/)
  })
})
