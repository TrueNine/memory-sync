#!/usr/bin/env bun
import {readFileSync, readdirSync} from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const CALVER_VERSION_REGEX = /^\d{4}\.(?:0|1\d{2}(?:\d{2})?)\.(?:0|1\d{2}(?:\d{2}(?:\d{2})?)?)$/u
const rootDir = process.cwd()
const expectedVersion = process.argv[2]?.trim()

if (expectedVersion == null || expectedVersion === '') {
  console.error('Expected version argument is required.')
  process.exit(1)
}

if (!CALVER_VERSION_REGEX.test(expectedVersion)) {
  console.error(`Invalid release version: ${expectedVersion}`)
  process.exit(1)
}

function readJson(relativePath: string): Record<string, unknown> {
  const filePath = path.join(rootDir, relativePath)
  return JSON.parse(readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '')) as Record<string, unknown>
}

function readText(relativePath: string): string {
  return readFileSync(path.join(rootDir, relativePath), 'utf-8')
}

function extractTomlValue(content: string, sectionName: string, key: string): string | undefined {
  const lines = content.split(/\r?\n/u)
  let inTargetSection = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (/^\[.*\]$/u.test(trimmed)) {
      inTargetSection = trimmed === `[${sectionName}]`
      continue
    }

    if (!inTargetSection) {
      continue
    }

    const match = trimmed.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"$`, 'u'))
    if (match != null) {
      return match[1]
    }
  }

  return undefined
}

function ensure(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message)
  }
}

function checkJsonVersion(relativePath: string): void {
  const version = readJson(relativePath).version
  ensure(version === expectedVersion, `${relativePath} has version ${String(version)}, expected ${expectedVersion}`)
}

function checkObsidianReleaseMetadata(): void {
  const pluginManifest = readJson('croessweave-obsidian-plugin/manifest.json')
  const rootManifest = readJson('manifest.json')
  const pluginVersions = readJson('croessweave-obsidian-plugin/versions.json')
  const rootVersions = readJson('versions.json')
  const minAppVersion = pluginManifest.minAppVersion

  ensure(pluginManifest.id === 'tnmsop', 'croessweave-obsidian-plugin/manifest.json must use id=tnmsop')
  ensure(pluginManifest.version === expectedVersion, `croessweave-obsidian-plugin/manifest.json expected version ${expectedVersion}`)
  ensure(typeof minAppVersion === 'string' && minAppVersion !== '', 'TNMSOP minAppVersion is required')
  ensure(JSON.stringify(rootManifest) === JSON.stringify(pluginManifest), 'Root manifest.json must mirror the TNMSOP manifest')
  ensure(pluginVersions[expectedVersion] === minAppVersion, `croessweave-obsidian-plugin/versions.json must map ${expectedVersion} to ${String(minAppVersion)}`)
  ensure(JSON.stringify(rootVersions) === JSON.stringify(pluginVersions), 'Root versions.json must mirror TNMSOP versions.json')
}

function checkWorkspaceCargoVersion(relativePath: string, sectionName: string, key = 'version'): void {
  const value = extractTomlValue(readText(relativePath), sectionName, key)
  ensure(value === expectedVersion, `${relativePath} has ${sectionName}.${key}=${String(value)}, expected ${expectedVersion}`)
}

function checkCargoPackageVersion(relativePath: string): void {
  const content = readText(relativePath)
  const explicitVersion = extractTomlValue(content, 'package', 'version')
  if (explicitVersion != null) {
    ensure(explicitVersion === expectedVersion, `${relativePath} has package.version=${explicitVersion}, expected ${expectedVersion}`)
    return
  }

  ensure(
    /^\s*version\.workspace\s*=\s*true\s*$/mu.test(content),
    `${relativePath} must use version.workspace = true or an explicit version matching ${expectedVersion}`
  )
}

function checkCargoLockVersions(relativePath: string, packageNames: readonly string[]): void {
  const content = readText(relativePath)
  for (const packageName of packageNames) {
    const pattern = new RegExp(
      String.raw`\[\[package\]\][\s\S]*?name = "${packageName}"[\s\S]*?version = "([^"]+)"`,
      'u'
    )
    const match = content.match(pattern)
    ensure(match != null, `${relativePath} is missing package ${packageName}`)
    ensure(match[1] === expectedVersion, `${relativePath} has ${packageName}@${match[1]}, expected ${expectedVersion}`)
  }
}

try {
  checkJsonVersion('package.json')
  checkJsonVersion('cli/package.json')
  checkJsonVersion('mcp/package.json')
  checkJsonVersion('gui/package.json')
  checkJsonVersion('doc/package.json')
  checkJsonVersion('croessweave-obsidian-plugin/package.json')
  checkJsonVersion('gui/src-tauri/tauri.conf.json')
  checkObsidianReleaseMetadata()

  for (const entry of readdirSync(path.join(rootDir, 'cli', 'npm'), {withFileTypes: true})) {
    if (!entry.isDirectory()) continue
    checkJsonVersion(path.join('cli', 'npm', entry.name, 'package.json'))
  }

  for (const entry of readdirSync(path.join(rootDir, 'mcp', 'npm'), {withFileTypes: true})) {
    if (!entry.isDirectory()) continue
    checkJsonVersion(path.join('mcp', 'npm', entry.name, 'package.json'))
  }

  checkWorkspaceCargoVersion('Cargo.toml', 'workspace.package')
  checkCargoPackageVersion('sdk/Cargo.toml')
  checkCargoPackageVersion('cli/Cargo.toml')
  checkCargoPackageVersion('mcp/Cargo.toml')
  checkCargoPackageVersion('gui/src-tauri/Cargo.toml')
  checkCargoLockVersions('Cargo.lock', [
    'tnmsd',
    'tnmsc',
    'tnmsm',
    'tnmsg',
  ])

  console.log(`Validated version surfaces for ${expectedVersion}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
