#!/usr/bin/env node
/**
 * Version Sync Script
 * 提交前自动同步所有子包版本
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 读取 pnpm-workspace.yaml 中的 catalog 版本
function getCatalogVersion(pkgName) {
  try {
    const yamlContent = readFileSync(resolve('pnpm-workspace.yaml'), 'utf-8')
    const match = yamlContent.match(new RegExp(`${pkgName.replace('@', '\\@')}:\\s*\\^?([^\\s]+)`))
    return match ? match[1] : null
  } catch {
    return null
  }
}

const eslintConfigVersion = getCatalogVersion('@truenine/eslint9-config')
const rootPkg = JSON.parse(readFileSync(resolve('package.json'), 'utf-8'))
const rootVersion = rootPkg.version

if (!rootVersion) {
  console.error('❌ Root package.json 缺少 version 字段')
  process.exit(1)
}

console.log(`🔄 同步版本: ${rootVersion}`)
if (eslintConfigVersion) {
  console.log(`🔄 Catalog @truenine/eslint9-config: ^${eslintConfigVersion}`)
}

const packages = [
  { path: 'cli/package.json', name: 'cli', updateDeps: false },
  { path: 'gui/package.json', name: 'gui', updateDeps: false },
  { path: 'aindex/package.json', name: 'aindex', updateDeps: true, depName: '@truenine/memory-sync-cli' },
]

let changed = false

for (const pkg of packages) {
  const fullPath = resolve(pkg.path)
  const content = readFileSync(fullPath, 'utf-8')
  const pkgJson = JSON.parse(content)

  // 同步版本
  if (pkgJson.version !== rootVersion) {
    pkgJson.version = rootVersion
    console.log(`  ✓ ${pkg.name}: version ${pkgJson.version} → ${rootVersion}`)
    changed = true
  }

  // 更新依赖引用
  if (pkg.updateDeps && pkg.depName) {
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
      if (pkgJson[section]?.[pkg.depName]) {
        const oldVer = pkgJson[section][pkg.depName]
        if (oldVer !== rootVersion) {
          pkgJson[section][pkg.depName] = rootVersion
          console.log(`  ✓ ${pkg.name}: ${section}.${pkg.depName} ${oldVer} → ${rootVersion}`)
          changed = true
        }
      }
    }
  }

  // 同步 catalog 中的 eslint9-config 版本到 aindex
  if (pkg.name === 'aindex' && eslintConfigVersion) {
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
      if (pkgJson[section]?.['@truenine/eslint9-config']) {
        const oldVer = pkgJson[section]['@truenine/eslint9-config']
        if (oldVer !== eslintConfigVersion) {
          pkgJson[section]['@truenine/eslint9-config'] = eslintConfigVersion
          console.log(`  ✓ ${pkg.name}: ${section}.@truenine/eslint9-config ${oldVer} → ${eslintConfigVersion}`)
          changed = true
        }
      }
    }
  }

  if (changed) {
    // 保持原有缩进 (2空格)
    writeFileSync(fullPath, JSON.stringify(pkgJson, null, 2) + '\n', 'utf-8')
  }
}

if (changed) {
  console.log('\n📦 版本已同步，自动暂存修改...')
  try {
    execSync('git add cli/package.json gui/package.json aindex/package.json', { stdio: 'inherit' })
    console.log('✅ 已暂存修改的文件')
  } catch {
    console.log('⚠️ git add 失败，请手动执行')
  }
} else {
  console.log('\n✅ 所有版本已一致，无需更新')
}
