#!/usr/bin/env tsx
/**
 * Version Sync Script
 * 提交前自动同步所有子包版本
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

interface PackageEntry {
  readonly path: string
  readonly name: string
  readonly updateDeps: boolean
  readonly depName?: string
}

interface PackageJson {
  version?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
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

const eslintConfigVersion = getCatalogVersion('@truenine/eslint9-config')
const rootPkg: PackageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf-8'))
const rootVersion = rootPkg.version

if (!rootVersion) {
  console.error('❌ Root package.json 缺少 version 字段')
  process.exit(1)
}

console.log(`🔄 同步版本: ${rootVersion}`)
if (eslintConfigVersion) {
  console.log(`🔄 Catalog @truenine/eslint9-config: ^${eslintConfigVersion}`)
}

const DEP_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies'] as const

const packages: readonly PackageEntry[] = [
  { path: 'cli/package.json', name: 'cli', updateDeps: false },
  { path: 'gui/package.json', name: 'gui', updateDeps: false },
  { path: 'aindex/package.json', name: 'aindex', updateDeps: true, depName: '@truenine/memory-sync-cli' },
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

  if (pkg.updateDeps && pkg.depName) {
    for (const section of DEP_SECTIONS) {
      const deps = pkgJson[section]
      if (deps?.[pkg.depName] && deps[pkg.depName] !== rootVersion) {
        console.log(`  ✓ ${pkg.name}: ${section}.${pkg.depName} ${deps[pkg.depName]} → ${rootVersion}`)
        deps[pkg.depName] = rootVersion
        changed = true
      }
    }
  }

  if (pkg.name === 'aindex' && eslintConfigVersion) {
    for (const section of DEP_SECTIONS) {
      const deps = pkgJson[section]
      if (deps?.['@truenine/eslint9-config'] && deps['@truenine/eslint9-config'] !== eslintConfigVersion) {
        console.log(`  ✓ ${pkg.name}: ${section}.@truenine/eslint9-config ${deps['@truenine/eslint9-config']} → ${eslintConfigVersion}`)
        deps['@truenine/eslint9-config'] = eslintConfigVersion
        changed = true
      }
    }
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

if (changed) {
  console.log('\n📦 版本已同步，自动暂存修改...')
  try {
    execSync('git add cli/package.json gui/package.json gui/src-tauri/Cargo.toml', { stdio: 'inherit' })
    // aindex 是 submodule，需要在子模块内 git add
    try {
      execSync('git -C aindex add package.json', { stdio: 'inherit' })
    } catch {
      console.log('⚠️ aindex submodule git add 失败，请手动执行')
    }
    console.log('✅ 已暂存修改的文件')
  } catch {
    console.log('⚠️ git add 失败，请手动执行')
  }
} else {
  console.log('\n✅ 所有版本已一致，无需更新')
}
