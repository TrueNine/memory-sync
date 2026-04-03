import {spawn} from 'node:child_process'
import {fileURLToPath} from 'node:url'

const pagefindBin = fileURLToPath(
  new URL('../node_modules/pagefind/lib/runner/bin.cjs', import.meta.url)
)
const pagefindArgs = [
  pagefindBin,
  '--site',
  '.next/server/app',
  '--output-path',
  'public/_pagefind'
] as const

const STEMMING_WARNING_LINES = new Set([
  "Note: Pagefind doesn't support stemming for the language zh-cn.",
  'Search will still work, but will not match across root words.'
])

function filterKnownNoise(output: string): string {
  return output
    .split(/\r?\n/u)
    .filter(line => !STEMMING_WARNING_LINES.has(line.trim()))
    .join('\n')
    .replace(/\n+$/u, '\n')
}

const child = spawn(process.execPath, pagefindArgs, {
  cwd: process.cwd(),
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe']
})

let stdout = ''
let stderr = ''

child.stdout.on('data', chunk => {
  stdout += chunk.toString()
})

child.stderr.on('data', chunk => {
  stderr += chunk.toString()
})

child.on('close', code => {
  const filteredStdout = filterKnownNoise(stdout)
  const filteredStderr = filterKnownNoise(stderr)

  if (filteredStdout !== '') {
    process.stdout.write(filteredStdout)
  }

  if (filteredStderr !== '') {
    process.stderr.write(filteredStderr)
  }

  process.exit(code ?? 1)
})

child.on('error', error => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
