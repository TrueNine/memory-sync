import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {defineConfig} from 'tsdown'
import {AINDEX_BASE, bundlePaths} from './structure.config'

/**
 * 生成 INJECTED 对象的内容
 * key: path（相对于 aindex）
 * value: 文件内容
 */
function generateInjectedContent(): Record<string, string> {
  const content: Record<string, string> = {}

  for (const path of bundlePaths) {
    const absolutePath = resolve(__dirname, AINDEX_BASE, path)
    content[path] = readFileSync(absolutePath, 'utf8')
  }

  return content
}

/**
 * tsdown 配置
 * 将所有 bundle 内容合并为单一 INJECTED 对象注入
 */
export default defineConfig([
  {
    entry: ['./src/index.ts', '!**/*.{spec,test}.*'],
    platform: 'node',
    sourcemap: true,
    unbundle: false,
    format: ['esm', 'cjs'],
    minify: false,
    dts: {sourcemap: true},
    define: {
      INJECTED: JSON.stringify(generateInjectedContent())
    }
  }
])
