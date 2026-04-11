import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import markdownOutput from '../../scripts/markdown-output'

const {writeError, writeMarkdownBlock} = markdownOutput

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
    writeMarkdownBlock('Icon generation complete', {
      source: sourceIcon,
      output: iconsDir,
    })
  } catch (error) {
    writeError('Icon generation failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    process.exit(1)
  }
}

main().then(r => r)
