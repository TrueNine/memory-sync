import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const iconsDir = join(rootDir, 'src-tauri', 'icons')
const sourceIcon = join(iconsDir, 'icon-source.png')

async function main() {
  try {
    execSync(
      `tauri icon "${sourceIcon}" -o "${iconsDir}"`,
      {
        cwd: rootDir,
        stdio: 'pipe', // 抑制输出
        encoding: 'utf-8',
      }
    )
    console.log('✓ Icons generated successfully')
  } catch (error) {
    console.error('✗ Failed to generate icons')
    process.exit(1)
  }
}

main()
