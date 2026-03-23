#!/usr/bin/env tsx
/**
 * Version Sync Script
 * Auto-sync all publishable package versions before commit.
 */
import {readdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join, relative, resolve} from 'node:path'
import process from 'node:process'

interface VersionedJson {
  version?: string
  [key: string]: unknown
}

const ROOT_DIR = resolve('.')
const ROOT_PACKAGE_PATH = resolve(ROOT_DIR, 'package.json')
const ROOT_CARGO_PATH = resolve(ROOT_DIR, 'Cargo.toml')
const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
  'target',
])

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

function syncJsonVersion(
  filePath: string,
  rootVersion: string,
  changedPaths: Set<string>,
): void {
  try {
    const json = readJsonFile(filePath)
    if (json.version === rootVersion) {
      return
    }

    console.log(`  ✓ ${relative(ROOT_DIR, filePath)}: version ${String(json.version ?? '(none)')} -> ${rootVersion}`)
    json.version = rootVersion
    writeJsonFile(filePath, json)
    changedPaths.add(filePath)
  } catch {
    console.log(`⚠️ ${relative(ROOT_DIR, filePath)} not found or invalid, skipping`)
  }
}

function syncCargoVersion(
  filePath: string,
  sectionName: string,
  rootVersion: string,
  changedPaths: Set<string>,
): void {
  try {
    const originalContent = readFileSync(filePath, 'utf-8')
    const updatedContent = updateVersionLineInSection(originalContent, sectionName, rootVersion)

    if (updatedContent === originalContent) {
      return
    }

    writeFileSync(filePath, updatedContent, 'utf-8')
    console.log(`  ✓ ${relative(ROOT_DIR, filePath)}: version -> ${rootVersion}`)
    changedPaths.add(filePath)
  } catch {
    console.log(`⚠️ ${relative(ROOT_DIR, filePath)} not found or invalid, skipping`)
  }
}

const requestedVersion = process.argv[2]?.trim()
const rootPkg = readJsonFile(ROOT_PACKAGE_PATH)
const changedPaths = new Set<string>()

if (requestedVersion && rootPkg.version !== requestedVersion) {
  rootPkg.version = requestedVersion
  writeJsonFile(ROOT_PACKAGE_PATH, rootPkg)
  changedPaths.add(ROOT_PACKAGE_PATH)
}

const rootVersion = rootPkg.version

if (rootVersion == null || rootVersion === '') {
  console.error('Root package.json missing version field')
  process.exit(1)
}

console.log(`🔄 Syncing version: ${rootVersion}`)

const packageJsonPaths = discoverFilesByName(ROOT_DIR, 'package.json')
  .filter(filePath => resolve(filePath) !== ROOT_PACKAGE_PATH)
  .sort()

for (const filePath of packageJsonPaths) {
  syncJsonVersion(filePath, rootVersion, changedPaths)
}

syncCargoVersion(ROOT_CARGO_PATH, 'workspace.package', rootVersion, changedPaths)

const cargoTomlPaths = discoverFilesByName(ROOT_DIR, 'Cargo.toml')
  .filter(filePath => resolve(filePath) !== ROOT_CARGO_PATH)
  .sort()

for (const filePath of cargoTomlPaths) {
  syncCargoVersion(filePath, 'package', rootVersion, changedPaths)
}

for (const filePath of discoverFilesByName(ROOT_DIR, 'tauri.conf.json').sort()) {
  syncJsonVersion(filePath, rootVersion, changedPaths)
}

if (changedPaths.size === 0) {
  console.log('\n✅ All versions consistent, no update needed')
  process.exit(0)
}

const changedRelativePaths = [...changedPaths]
  .map(filePath => relative(ROOT_DIR, filePath))
  .sort()

console.error('\n❌ Versions were out of sync. Updated files:')
for (const relativePath of changedRelativePaths) {
  console.error(`  - ${relativePath}`)
}
console.error('\nReview these changes and rerun the commit.')
process.exit(1)
