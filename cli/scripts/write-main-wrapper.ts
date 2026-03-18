import {spawnSync} from 'node:child_process'
import {chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const cliDir = resolve(scriptDir, '..')
const distDir = resolve(cliDir, 'dist')
const indexEntryPath = resolve(distDir, 'index.mjs')
const mainWrapperPath = resolve(distDir, 'main.mjs')
const bundledJitiBabelRuntimeSourcePath = resolve(cliDir, 'node_modules', 'jiti', 'dist', 'babel.cjs')
const bundledJitiBabelRuntimeTargetPath = resolve(distDir, 'babel.cjs')

const SHEBANG = '#!/usr/bin/env node'

const MAIN_WRAPPER_CONTENT = [
  SHEBANG,
  "import process from 'node:process'",
  "import {runCli} from './index.mjs'",
  '',
  'void runCli(process.argv).then(exitCode => process.exit(exitCode))',
  ''
].join('\n')

function ensureIndexBundleExists(): void {
  if (existsSync(indexEntryPath)) {
    return
  }

  throw new Error(`Expected bundled CLI entry at "${indexEntryPath}" before writing main wrapper.`)
}

function writeMainWrapper(): void {
  mkdirSync(distDir, {recursive: true})
  writeFileSync(mainWrapperPath, MAIN_WRAPPER_CONTENT, 'utf8')

  if (process.platform !== 'win32') {
    chmodSync(mainWrapperPath, 0o755)
  }
}

function findBundledJitiChunkPath(): string | undefined {
  const bundledJitiChunkName = readdirSync(distDir)
    .find(fileName => /^jiti-.*\.mjs$/u.test(fileName))

  return bundledJitiChunkName == null ? void 0 : resolve(distDir, bundledJitiChunkName)
}

function ensureBundledJitiRuntimeAssets(): string | undefined {
  const bundledJitiChunkPath = findBundledJitiChunkPath()
  if (bundledJitiChunkPath == null) return void 0

  if (!existsSync(bundledJitiBabelRuntimeSourcePath)) {
    throw new Error(
      `Bundled jiti chunk "${bundledJitiChunkPath}" requires "${bundledJitiBabelRuntimeSourcePath}", but it does not exist.`
    )
  }

  copyFileSync(bundledJitiBabelRuntimeSourcePath, bundledJitiBabelRuntimeTargetPath)
  return bundledJitiChunkPath
}

function assertMainWrapperSize(): void {
  const wrapperStats = statSync(mainWrapperPath)

  if (wrapperStats.size <= `${SHEBANG}\n`.length) {
    throw new Error(`Generated "${mainWrapperPath}" is unexpectedly small (${wrapperStats.size} bytes).`)
  }
}

function smokeTestBundledJitiTransform(bundledJitiChunkPath: string | undefined): void {
  if (bundledJitiChunkPath == null) return

  const tempDir = mkdtempSync(join(tmpdir(), 'tnmsc-bundled-jiti-'))
  const probeModulePath = join(tempDir, 'probe.ts')
  const probeRunnerPath = join(tempDir, 'probe-runner.mjs')

  writeFileSync(probeModulePath, 'export default {ok: true}\n', 'utf8')
  writeFileSync(probeRunnerPath, [
    "import process from 'node:process'",
    "import {pathToFileURL} from 'node:url'",
    '',
    'const [, , bundledJitiChunkPathArg, probeModulePathArg] = process.argv',
    '',
    'const {createJiti} = await import(pathToFileURL(bundledJitiChunkPathArg).href)',
    'const runtime = createJiti(import.meta.url, {',
    '  fsCache: false,',
    '  moduleCache: false,',
    '  interopDefault: false',
    '})',
    'const loaded = await runtime.import(probeModulePathArg)',
    '',
    'if (loaded.default?.ok !== true) {',
    "  throw new Error('Bundled jiti smoke test loaded an unexpected module shape.')",
    '}',
    ''
  ].join('\n'), 'utf8')

  const smokeTest = (() => {
    try {
      return spawnSync(process.execPath, [probeRunnerPath, bundledJitiChunkPath, probeModulePath], {
        cwd: cliDir,
        encoding: 'utf8'
      })
    }
    finally {
      rmSync(tempDir, {recursive: true, force: true})
    }
  })()

  if (smokeTest.error != null) {
    throw smokeTest.error
  }

  const combinedOutput = `${smokeTest.stdout ?? ''}${smokeTest.stderr ?? ''}`.trim()

  if (smokeTest.status !== 0) {
    throw new Error([
      `Bundled jiti chunk "${pathToFileURL(bundledJitiChunkPath).href}" failed the transform smoke test.`,
      combinedOutput.length === 0 ? 'No output captured.' : combinedOutput
    ].join('\n'))
  }
}

function smokeTestMainWrapper(): void {
  const isolatedHomeDir = mkdtempSync(join(tmpdir(), 'tnmsc-main-wrapper-home-'))
  const smokeTest = (() => {
    try {
      return spawnSync(process.execPath, [mainWrapperPath, '--help'], {
        cwd: cliDir,
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: isolatedHomeDir,
          USERPROFILE: isolatedHomeDir
        }
      })
    }
    finally {
      rmSync(isolatedHomeDir, {recursive: true, force: true})
    }
  })()

  if (smokeTest.error != null) {
    throw smokeTest.error
  }

  const combinedOutput = `${smokeTest.stdout ?? ''}${smokeTest.stderr ?? ''}`

  if (smokeTest.status !== 0) {
    throw new Error([
      `Generated "${mainWrapperPath}" failed the CLI smoke test.`,
      `Exit code: ${smokeTest.status ?? 'unknown'}`,
      combinedOutput.trim().length === 0 ? 'No CLI output captured.' : combinedOutput.trim()
    ].join('\n'))
  }

  if (!/(?:USAGE:|tnmsc v)/u.test(combinedOutput)) {
    throw new Error([
      `Generated "${mainWrapperPath}" did not print CLI help output.`,
      combinedOutput.trim().length === 0 ? 'No CLI output captured.' : combinedOutput.trim()
    ].join('\n'))
  }
}

ensureIndexBundleExists()
writeMainWrapper()
const bundledJitiChunkPath = ensureBundledJitiRuntimeAssets()
assertMainWrapperSize()
smokeTestBundledJitiTransform(bundledJitiChunkPath)
smokeTestMainWrapper()

console.log(`Wrote and validated CLI main wrapper at ${mainWrapperPath}`)
