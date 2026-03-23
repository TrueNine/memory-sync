#!/usr/bin/env tsx
/**
 * Version Sync Script
 * Auto-sync all publishable package versions before commit.
 */
import {execFileSync} from 'node:child_process'
import {readdirSync, readFileSync, writeFileSync} from 'node:fs'
import {basename, join, relative, resolve} from 'node:path'
import process from 'node:process'
import {pathToFileURL} from 'node:url'

interface VersionedJson {
  version?: string
  [key: string]: unknown
}

export interface SyncVersionsOptions {
  readonly requestedVersion?: string
  readonly rootDir?: string
}

export interface SyncVersionsResult {
  readonly changedPaths: readonly string[]
  readonly rootDir: string
  readonly targetVersion: string
  readonly versionSource: string
}

const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
  'target',
])
const CALVER_VERSION_REGEX = /^\d{4}\.(?:0|1\d{2}(?:\d{2})?)\.(?:0|1\d{2}(?:\d{2}(?:\d{2})?)?)$/u

function readJsonFile(filePath: string): VersionedJson {
  return JSON.parse(readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '')) as VersionedJson
}

function writeJsonFile(filePath: string, value: VersionedJson): void {
  writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf-8')
}

function discoverFilesByName(baseDir: string, fileName: string): string[] {
  const found: string[] = []
  const entries = readdirSync(baseDir, {withFileTypes: true})

  for (const entry of entries) {
    const entryPath = join(baseDir, entry.name)

    if (entry.isDirectory()) {
      if (entry.name.startsWith('.')) {
        continue
      }

      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue
      }

      found.push(...discoverFilesByName(entryPath, fileName))
      continue
    }

    if (entry.isFile() && entry.name === fileName) {
      found.push(entryPath)
    }
  }

  return found
}

function updateVersionLineInSection(
  content: string,
  sectionName: string,
  targetVersion: string,
): string {
  const lines = content.split(/\r?\n/)
  let inTargetSection = false

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()

    if (/^\[.*\]$/.test(trimmed)) {
      inTargetSection = trimmed === `[${sectionName}]`
      continue
    }

    if (!inTargetSection) {
      continue
    }

    if (/^version\.workspace\s*=/.test(trimmed)) {
      return content
    }

    const match = line.match(/^(\s*version\s*=\s*")([^"]+)(".*)$/)
    if (match == null) {
      continue
    }

    if (match[2] === targetVersion) {
      return content
    }

    lines[index] = `${match[1]}${targetVersion}${match[3]}`
    return lines.join('\n')
  }

  return content
}

function runGit(rootDir: string, args: readonly string[]): string {
  return execFileSync('git', args, {
    cwd: rootDir,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim()
}

function validateVersion(version: string, source: string): void {
  if (!CALVER_VERSION_REGEX.test(version)) {
    throw new Error(`Invalid CalVer version in ${source}: ${version}`)
  }
}

function syncJsonVersion(
  filePath: string,
  targetVersion: string,
  changedPaths: Set<string>,
): void {
  try {
    const json = readJsonFile(filePath)
    if (json.version === targetVersion) {
      return
    }

    json.version = targetVersion
    writeJsonFile(filePath, json)
    changedPaths.add(filePath)
  } catch {
    console.log(`⚠️ ${filePath} not found or invalid, skipping`)
  }
}

function syncCargoVersion(
  filePath: string,
  sectionName: string,
  targetVersion: string,
  changedPaths: Set<string>,
): void {
  try {
    const originalContent = readFileSync(filePath, 'utf-8')
    const updatedContent = updateVersionLineInSection(originalContent, sectionName, targetVersion)

    if (updatedContent === originalContent) {
      return
    }

    writeFileSync(filePath, updatedContent, 'utf-8')
    changedPaths.add(filePath)
  } catch {
    console.log(`⚠️ ${filePath} not found or invalid, skipping`)
  }
}

function getStagedPackageVersionCandidates(rootDir: string, rootVersion: string): Map<string, string[]> {
  const stagedFiles = runGit(rootDir, ['diff', '--cached', '--name-only', '--diff-filter=ACMR'])
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .filter(filePath => basename(filePath) === 'package.json')

  const candidates = new Map<string, string[]>()

  for (const relativePath of stagedFiles) {
    const stagedContent = runGit(rootDir, ['show', `:${relativePath}`])
    const json = JSON.parse(stagedContent.replace(/^\uFEFF/, '')) as VersionedJson
    const version = typeof json.version === 'string' ? json.version.trim() : ''

    if (version.length === 0 || version === rootVersion) {
      continue
    }

    validateVersion(version, `${relativePath} (staged)`)

    const existingPaths = candidates.get(version)
    if (existingPaths == null) {
      candidates.set(version, [relativePath])
      continue
    }

    existingPaths.push(relativePath)
  }

  return candidates
}

function resolveTargetVersion(
  rootDir: string,
  rootVersion: string,
  requestedVersion?: string,
): {readonly version: string, readonly source: string} {
  if (requestedVersion != null && requestedVersion !== '') {
    validateVersion(requestedVersion, 'requested version')
    return {
      version: requestedVersion,
      source: 'command argument'
    }
  }

  const candidates = getStagedPackageVersionCandidates(rootDir, rootVersion)
  const versions = [...candidates.keys()]

  if (versions.length === 0) {
    validateVersion(rootVersion, 'root package.json')
    return {
      version: rootVersion,
      source: 'root package.json'
    }
  }

  if (versions.length > 1) {
    const details = versions
      .sort()
      .map(version => `${version}: ${candidates.get(version)?.sort().join(', ') ?? ''}`)
      .join('; ')
    throw new Error(`Conflicting staged package.json versions detected: ${details}`)
  }

  const [version] = versions
  const sourcePaths = candidates.get(version) ?? []

  return {
    version,
    source: sourcePaths.sort().join(', ')
  }
}

function stageFiles(rootDir: string, filePaths: readonly string[]): void {
  if (filePaths.length === 0) {
    return
  }

  runGit(rootDir, ['add', '--', ...filePaths.map(filePath => relative(rootDir, filePath))])
}

export function runSyncVersions(options: SyncVersionsOptions = {}): SyncVersionsResult {
  const rootDir = resolve(options.rootDir ?? '.')
  const rootPackagePath = resolve(rootDir, 'package.json')
  const rootCargoPath = resolve(rootDir, 'Cargo.toml')
  const rootPkg = readJsonFile(rootPackagePath)
  const currentRootVersion = typeof rootPkg.version === 'string' ? rootPkg.version.trim() : ''

  if (currentRootVersion === '') {
    throw new Error('Root package.json missing version field')
  }

  validateVersion(currentRootVersion, 'root package.json')

  const target = resolveTargetVersion(rootDir, currentRootVersion, options.requestedVersion?.trim())
  const changedPaths = new Set<string>()

  if (rootPkg.version !== target.version) {
    rootPkg.version = target.version
    writeJsonFile(rootPackagePath, rootPkg)
    changedPaths.add(rootPackagePath)
  }

  const packageJsonPaths = discoverFilesByName(rootDir, 'package.json')
    .filter(filePath => resolve(filePath) !== rootPackagePath)
    .sort()

  for (const filePath of packageJsonPaths) {
    syncJsonVersion(filePath, target.version, changedPaths)
  }

  syncCargoVersion(rootCargoPath, 'workspace.package', target.version, changedPaths)

  const cargoTomlPaths = discoverFilesByName(rootDir, 'Cargo.toml')
    .filter(filePath => resolve(filePath) !== rootCargoPath)
    .sort()

  for (const filePath of cargoTomlPaths) {
    syncCargoVersion(filePath, 'package', target.version, changedPaths)
  }

  for (const filePath of discoverFilesByName(rootDir, 'tauri.conf.json').sort()) {
    syncJsonVersion(filePath, target.version, changedPaths)
  }

  stageFiles(rootDir, [...changedPaths].sort())

  return {
    changedPaths: [...changedPaths].sort(),
    rootDir,
    targetVersion: target.version,
    versionSource: target.source
  }
}

function shouldRunAsCli(entryPath: string | undefined): boolean {
  if (entryPath == null || entryPath === '') {
    return false
  }

  return import.meta.url === pathToFileURL(resolve(entryPath)).href
}

function main(): number {
  try {
    const requestedVersion = process.argv[2]?.trim()
    const result = runSyncVersions({requestedVersion})

    console.log(`🔄 Syncing version: ${result.targetVersion}`)
    console.log(`   source: ${result.versionSource}`)

    if (result.changedPaths.length === 0) {
      console.log('\n✅ All versions consistent, no update needed')
      return 0
    }

    console.log('\n✅ Synced and staged version updates:')
    for (const filePath of result.changedPaths) {
      console.log(`  - ${relative(result.rootDir, filePath)}`)
    }

    return 0
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`\n❌ ${message}`)
    return 1
  }
}

if (shouldRunAsCli(process.argv[1])) {
  process.exit(main())
}
