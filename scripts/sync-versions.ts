#!/usr/bin/env tsx
/**
 * Version Sync Script
 * 提交前自动同步所有子包版本
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
  console.error('❌ Root package.json 缺少 version 字段')
  process.exit(1)
}

console.log(`🔄 同步版本: ${rootVersion}`)
if (eslintConfigVersion) {
  console.log(`🔄 Catalog @truenine/eslint10-config: ^${eslintConfigVersion}`)
}

const packages: readonly PackageEntry[] = [
  { path: 'cli/package.json', name: 'cli' },
  { path: 'gui/package.json', name: 'gui' },
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

// 同步 Cargo.toml 版本
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
  console.log('⚠️ gui/src-tauri/Cargo.toml 不存在，跳过')
}

// 同步 tauri.conf.json 版本
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
  console.log('⚠️ gui/src-tauri/tauri.conf.json 不存在，跳过')
}

if (changed) {
  console.log('\n📦 版本已同步，自动暂存修改...')
  try {
    execSync('git add cli/package.json gui/package.json gui/src-tauri/Cargo.toml gui/src-tauri/tauri.conf.json', { stdio: 'inherit' })
    console.log('✅ 已暂存修改的文件')
  } catch {
    console.log('⚠️ git add 失败，请手动执行')
  }
} else {
  console.log('\n✅ 所有版本已一致，无需更新')
}
