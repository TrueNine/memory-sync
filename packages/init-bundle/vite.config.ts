import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {fileURLToPath, URL} from 'node:url'
import {defineConfig} from 'vite'
import {bundlePaths, PUBLIC_BASE} from './structure.config'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/**
 * 生成 INJECTED 对象的内容
 * key: path（相对于 public）
 * value: 文件内容
 */
function generateInjectedContent(): Record<string, string> {
  const content: Record<string, string> = {}

  for (const path of bundlePaths) {
    const absolutePath = resolve(__dirname, PUBLIC_BASE, path)
    content[path] = readFileSync(absolutePath, 'utf8')
  }

  return content
}

/**
 * Vite 配置
 * 与 tsdown 共用相同的注入逻辑
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  define: {
    INJECTED: JSON.stringify(generateInjectedContent())
  }
})
