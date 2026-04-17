import * as fs from 'node:fs'
import * as path from 'node:path'
import {fileURLToPath} from 'node:url'
import {defineConfig} from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function tryResolve(baseDir: string, relPath: string): string | undefined {
  const candidate = path.resolve(baseDir, relPath)
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return candidate
  }
  const exts = ['.ts', '.tsx', '.js', '.jsx']
  for (const ext of exts) {
    if (fs.existsSync(candidate + ext)) return candidate + ext
  }
  if (!(fs.existsSync(candidate) && fs.statSync(candidate).isDirectory())) return void 0

  const indexExts = ['index.ts', 'index.tsx', 'index.js', 'index.jsx']
  for (const ext of indexExts) {
    const indexPath = path.join(candidate, ext)
    if (fs.existsSync(indexPath)) return indexPath
  }
  return void 0
}

export default defineConfig({
  plugins: [
    {
      name: 'resolve-sdk-aliases',
      enforce: 'pre',
      resolveId(id) {
        if (!id.startsWith('@/')) return void 0
        const rel = id.slice(2)
        const local = tryResolve(path.resolve(__dirname, 'src'), rel)
        if (local != null) return local
        const sdk = tryResolve(path.resolve(__dirname, '../sdk/src'), rel)
        if (sdk != null) return sdk
        return void 0
      }
    }
  ]
})
