import type {Buffer} from 'node:buffer'
import {spawn} from 'node:child_process'
import process from 'node:process'
import {fileURLToPath} from 'node:url'

const pagefindBin = fileURLToPath(new URL('../node_modules/pagefind/lib/runner/bin.cjs', import.meta.url))
const pagefindArgs = [pagefindBin, '--site', '.next/server/app', '--output-path', 'public/_pagefind'] as const

const STEMMING_WARNING_LINES = new Set([
  'Note: Pagefind doesn\'t support stemming for the language zh-cn.',
  'Search will still work, but will not match across root words.'
])

const LINE_BREAK_REGEX = /\r?\n/u
const TRAILING_NEWLINES_REGEX = /\n+$/u

function filterKnownNoise(output: string): string {
  return output
    .split(LINE_BREAK_REGEX)
    .filter(line => !STEMMING_WARNING_LINES.has(line.trim()))
    .join('\n')
    .replace(TRAILING_NEWLINES_REGEX, '\n')
}

const child = spawn(process.execPath, pagefindArgs, {
  cwd: process.cwd(),
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe']
})

let stdout = ''
let stderr = ''

child.stdout.on('data', (chunk: Buffer) => {
  stdout += chunk.toString()
})

child.stderr.on('data', (chunk: Buffer) => {
  stderr += chunk.toString()
})

child.on('close', (code: number | null) => {
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

child.on('error', (error: Error) => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
