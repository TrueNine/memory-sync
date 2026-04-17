#!/usr/bin/env tsx
import {readFileSync, readdirSync} from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import {echo} from 'zx'

const CALVER_VERSION_REGEX = /^\d{4}\.(?:0|1\d{2}(?:\d{2})?)\.(?:0|1\d{2}(?:\d{2}(?:\d{2})?)?)$/u
const rootDir = process.cwd()
const expectedVersion = process.argv[2]?.trim()

if (expectedVersion == null || expectedVersion === '') {
  echo('Expected version argument is required.')
  process.exit(1)
}

if (!CALVER_VERSION_REGEX.test(expectedVersion)) {
  echo(`Invalid release version: ${expectedVersion}`)
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
  checkJsonVersion('gui/package.json')
  checkJsonVersion('doc/package.json')
  checkJsonVersion('gui/src-tauri/tauri.conf.json')

  for (const entry of readdirSync(path.join(rootDir, 'cli', 'npm'), {withFileTypes: true})) {
    if (!entry.isDirectory()) continue
    checkJsonVersion(path.join('cli', 'npm', entry.name, 'package.json'))
  }

  checkWorkspaceCargoVersion('Cargo.toml', 'workspace.package')
  checkCargoPackageVersion('sdk/Cargo.toml')
  checkCargoPackageVersion('cli/Cargo.toml')
  checkCargoPackageVersion('mcp/Cargo.toml')
  checkCargoPackageVersion('gui/src-tauri/Cargo.toml')
  checkCargoLockVersions('Cargo.lock', [
    'tnmsc',
    'tnmsc-cli-shell',
    'tnmsc-mcp',
    'memory-sync-gui',
  ])

  echo(`Validated version surfaces for ${expectedVersion}`)
} catch (error) {
  echo(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
