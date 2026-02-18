#!/usr/bin/env tsx
/**
 * Version Sync Script
 * Auto-sync all sub-package versions before commit
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'

interface PackageEntry {
  readonly path: string
  readonly name: string
}

interface PackageJson {
  version?: string
}

function getCatalogVersion(pkgName: string): string | null {
  try {
    const yamlContent = readFileSync(resolve('pnpm-workspace.yaml'), 'utf-8')
    const match = yamlContent.match(new RegExp(`${pkgName.replace('@', '\\@')}:\\s*\\^?([^\\s]+)`))
    return match ? match[1] : null
  } catch {
    return null
  }
}

const eslintConfigVersion = getCatalogVersion('@truenine/eslint10-config')
const rootPkg: PackageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf-8'))
const rootVersion = rootPkg.version

if (!rootVersion) {
  console.error('❌ Root package.json missing version field')
  process.exit(1)
}

console.log(`🔄 Syncing version: ${rootVersion}`)
if (eslintConfigVersion) {
  console.log(`🔄 Catalog @truenine/eslint10-config: ^${eslintConfigVersion}`)
}

const packages: readonly PackageEntry[] = [
  { path: 'cli/package.json', name: 'cli' },
  { path: 'gui/package.json', name: 'gui' },
  { path: 'doc/package.json', name: 'doc' },
]

let changed = false

for (const pkg of packages) {
  const fullPath = resolve(pkg.path)
  const content = readFileSync(fullPath, 'utf-8')
  const pkgJson: PackageJson = JSON.parse(content)

  if (pkgJson.version !== rootVersion) {
    console.log(`  ✓ ${pkg.name}: version ${pkgJson.version} → ${rootVersion}`)
    pkgJson.version = rootVersion
    changed = true
  }

  if (changed) {
    writeFileSync(fullPath, JSON.stringify(pkgJson, null, 2) + '\n', 'utf-8')
  }
}

// Sync Cargo.toml version
const cargoTomlPath = resolve('gui/src-tauri/Cargo.toml')
try {
  const cargoContent = readFileSync(cargoTomlPath, 'utf-8')
  const cargoUpdated = cargoContent.replace(/^version = ".*"/m, `version = "${rootVersion}"`)
  if (cargoContent !== cargoUpdated) {
    writeFileSync(cargoTomlPath, cargoUpdated, 'utf-8')
    console.log(`  ✓ Cargo.toml: version → ${rootVersion}`)
    changed = true
  }
} catch {
  console.log('⚠️ gui/src-tauri/Cargo.toml not found, skipping')
}

// Sync tauri.conf.json version
const tauriConfPath = resolve('gui/src-tauri/tauri.conf.json')
try {
  const tauriConfContent = readFileSync(tauriConfPath, 'utf-8')
  const tauriConf = JSON.parse(tauriConfContent)
  if (tauriConf.version !== rootVersion) {
    console.log(`  ✓ tauri.conf.json: version ${tauriConf.version ?? '(none)'} → ${rootVersion}`)
    tauriConf.version = rootVersion
    writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n', 'utf-8')
    changed = true
  }
} catch {
  console.log('⚠️ gui/src-tauri/tauri.conf.json not found, skipping')
}

// Sync version field in tnmsc.example.json files
const exampleConfigPaths = [
  'cli/public/tnmsc.example.json',
  'packages/init-bundle/public/public/tnmsc.example.json',
]

for (const examplePath of exampleConfigPaths) {
  const fullPath = resolve(examplePath)
  try {
    const content = readFileSync(fullPath, 'utf-8')
    const exampleJson = JSON.parse(content) as Record<string, unknown>
    if (exampleJson['version'] !== rootVersion) {
      console.log(`  ✓ ${examplePath}: version ${String(exampleJson['version'] ?? '(none)')} → ${rootVersion}`)
      exampleJson['version'] = rootVersion
      writeFileSync(fullPath, JSON.stringify(exampleJson, null, 2) + '\n', 'utf-8')
      changed = true
    }
  } catch {
    console.log(`⚠️ ${examplePath} not found or invalid, skipping`)
  }
}

if (changed) {
  console.log('\n📦 Versions synced, auto-staging changes...')
  try {
    execSync(
      'git add cli/package.json gui/package.json doc/package.json gui/src-tauri/Cargo.toml gui/src-tauri/tauri.conf.json cli/public/tnmsc.example.json packages/init-bundle/public/public/tnmsc.example.json',
      { stdio: 'inherit' }
    )
    console.log('✅ Staged modified files')
  } catch {
    console.log('⚠️ git add failed, please execute manually')
  }
} else {
  console.log('\n✅ All versions consistent, no update needed')
}
