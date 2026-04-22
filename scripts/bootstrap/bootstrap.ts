#!/usr/bin/env tsx
import {readFileSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import process from 'node:process'
import {fileURLToPath} from 'node:url'
import {$} from 'zx'
import {writeError, writeMarkdownBlock} from '../shared/markdown-output'

interface RootPackageJson {
  packageManager?: string
  devEngines?: {
    node?: string
    rust?: string
  }
}

const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, '..', '..')
$.cwd = rootDir
$.verbose = false

const rootPackageJson = JSON.parse(
  readFileSync(resolve(rootDir, 'package.json'), 'utf-8')
) as RootPackageJson

function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.').map(part => Number.parseInt(part, 10) || 0)
  const rightParts = right.split('.').map(part => Number.parseInt(part, 10) || 0)
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0
    const rightValue = rightParts[index] ?? 0
    if (leftValue > rightValue) return 1
    if (leftValue < rightValue) return -1
  }

  return 0
}

function extractVersion(value: string, context: string): string {
  const match = value.match(/\d+(?:\.\d+){0,3}/u)
  if (match == null) {
    throw new Error(`Unable to parse version for ${context}: ${value}`)
  }
  return match[0]
}

function readMinimumVersion(range: string | undefined, fallback: string, context: string): string {
  if (range == null || range.trim() === '') {
    return fallback
  }

  const match = range.match(/>=\s*(\d+(?:\.\d+){0,3})/u)
  if (match == null) {
    throw new Error(`Unsupported version range for ${context}: ${range}`)
  }

  return match[1]
}

function readPackageManagerVersion(value: string | undefined): string {
  if (value == null || value.trim() === '') {
    throw new Error('packageManager is missing from package.json')
  }

  const match = value.match(/^[^@]+@(\d+(?:\.\d+){0,3})$/u)
  if (match == null) {
    throw new Error(`Unsupported packageManager value: ${value}`)
  }

  return match[1]
}

async function readCommandVersion(command: string, args: readonly string[], context: string): Promise<string> {
  const output = await $`${command} ${args}`
  return extractVersion(output.stdout, context)
}

function validateMinimumVersion(actual: string, minimum: string, context: string): void {
  if (compareVersions(actual, minimum) < 0) {
    throw new Error(`${context} ${actual} is below the required minimum ${minimum}`)
  }
}

async function runCommand(command: string, args: readonly string[], title: string): Promise<void> {
  writeMarkdownBlock(title, {
    command: `${command} ${args.join(' ')}`.trim(),
  })

  $.verbose = true
  try {
    await $`${command} ${args}`
  } finally {
    $.verbose = false
  }
}

async function main(): Promise<number> {
  try {
    const nodeMinimum = readMinimumVersion(rootPackageJson.devEngines?.node, '25.6.1', 'devEngines.node')
    const pnpmMinimum = readPackageManagerVersion(rootPackageJson.packageManager)
    const rustMinimum = readMinimumVersion(rootPackageJson.devEngines?.rust, '1.88.0', 'devEngines.rust')

    const nodeVersion = process.versions.node
    const pnpmVersion = await readCommandVersion('pnpm', ['--version'], 'pnpm')
    const cargoVersion = await readCommandVersion('cargo', ['--version'], 'cargo')

    validateMinimumVersion(nodeVersion, nodeMinimum, 'Node.js')
    validateMinimumVersion(pnpmVersion, pnpmMinimum, 'pnpm')
    validateMinimumVersion(cargoVersion, rustMinimum, 'Rust cargo')

    writeMarkdownBlock('Validated toolchain', {
      node: {
        actual: nodeVersion,
        minimum: nodeMinimum,
      },
      pnpm: {
        actual: pnpmVersion,
        minimum: pnpmMinimum,
      },
      cargo: {
        actual: cargoVersion,
        minimum: rustMinimum,
      },
    })

    await runCommand('pnpm', ['exec', 'simple-git-hooks'], 'Installing git hooks')
    await runCommand('cargo', ['fetch', '--locked'], 'Fetching Rust dependencies')

    writeMarkdownBlock('Bootstrap complete', {
      root: rootDir,
    })
    return 0
  } catch (error) {
    writeError('Bootstrap failed', {
      error: error instanceof Error ? error.message : String(error),
      nextStep: 'Install the required toolchains, then rerun `pnpm run bootstrap`.',
    })
    return 1
  }
}

void main().then(code => process.exit(code))
