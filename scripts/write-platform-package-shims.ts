#!/usr/bin/env tsx

import {mkdirSync, readdirSync, writeFileSync} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

export const PLATFORM_PACKAGE_SHIM = `import {readdirSync} from 'node:fs'
import {createRequire} from 'node:module'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const require = createRequire(import.meta.url)
const moduleDir = dirname(fileURLToPath(import.meta.url))
const nodeFiles = readdirSync(moduleDir).filter(file => file.endsWith('.node'))

function loadBinding(prefix) {
  const file = nodeFiles.find(candidate => candidate.startsWith(prefix))
  return file == null ? undefined : require(join(moduleDir, file))
}

export const logger = loadBinding('napi-logger.')
export const mdCompiler = loadBinding('napi-md-compiler.')
export const scriptRuntime = loadBinding('napi-script-runtime.')
export const config = loadBinding('napi-memory-sync-cli.')

const bindings = {logger, mdCompiler, scriptRuntime, config}

export default bindings
`

export const PLATFORM_PACKAGE_TYPES = `export declare const logger: unknown | undefined
export declare const mdCompiler: unknown | undefined
export declare const scriptRuntime: unknown | undefined
export declare const config: unknown | undefined

declare const bindings: {
  readonly logger: typeof logger
  readonly mdCompiler: typeof mdCompiler
  readonly scriptRuntime: typeof scriptRuntime
  readonly config: typeof config
}

export default bindings
`

export function resolveTargetDirs(args: readonly string[]): string[] {
  if (args.length > 0) {
    return args.map(targetDir => resolve(process.cwd(), targetDir))
  }

  const npmPackagesDir = join(root, 'cli', 'npm')
  return readdirSync(npmPackagesDir, {withFileTypes: true})
    .filter(entry => entry.isDirectory())
    .map(entry => join(npmPackagesDir, entry.name))
}

export function writePlatformPackageShim(targetDir: string): void {
  mkdirSync(targetDir, {recursive: true})
  writeFileSync(join(targetDir, 'noop.mjs'), PLATFORM_PACKAGE_SHIM, 'utf8')
  writeFileSync(join(targetDir, 'noop.d.mts'), PLATFORM_PACKAGE_TYPES, 'utf8')
}

export function writePlatformPackageShims(targetDirs: readonly string[]): void {
  for (const targetDir of targetDirs) {
    writePlatformPackageShim(targetDir)
  }
}

function isEntrypoint(): boolean {
  const entryArg = process.argv[1]
  if (entryArg == null) return false

  return import.meta.url === pathToFileURL(entryArg).href
}

if (isEntrypoint()) {
  writePlatformPackageShims(resolveTargetDirs(process.argv.slice(2)))
}
