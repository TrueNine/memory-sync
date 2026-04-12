#!/usr/bin/env tsx

import {spawnSync} from 'node:child_process'
import {copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {tmpdir} from 'node:os'
import {dirname, join, resolve} from 'node:path'
import process from 'node:process'
import {fileURLToPath} from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const cliDir = resolve(__dirname, '..')
const sdkDistDir = resolve(cliDir, '../sdk/dist')
const cliDistDir = resolve(cliDir, 'dist')
const scriptRuntimeWorkerPath = resolve(cliDistDir, 'script-runtime-worker.mjs')
const builtInternalCommandBridgePath = resolve(cliDistDir, 'native-command-bridge.mjs')
const internalCommandBridgePath = resolve(cliDistDir, 'internal', 'native-command-bridge.mjs')

const EXACT_FILES = new Set(['tnmsc.schema.json'])
const runtimeRequire = createRequire(import.meta.url)
const bundledJitiBabelRuntimeSourcePath = resolve(
  dirname(runtimeRequire.resolve('jiti')),
  '../dist/babel.cjs'
)
const bundledJitiBabelRuntimeTargetPath = resolve(cliDistDir, 'babel.cjs')

function shouldCopyFromSdk(fileName: string): boolean {
  return EXACT_FILES.has(fileName)
}

function getCombinedOutput(stdout?: string | null, stderr?: string | null): string {
  return `${stdout ?? ''}${stderr ?? ''}`.trim()
}

function assertProcessSucceeded(
  result: ReturnType<typeof spawnSync>,
  lines: readonly string[]
): void {
  if (result.error != null) {
    throw result.error
  }

  if (result.status === 0) {
    return
  }

  throw new Error([
    ...lines,
    getCombinedOutput(result.stdout, result.stderr) || 'No output captured.'
  ].join('\n'))
}

function withTempDir<T>(prefix: string, callback: (tempDir: string) => T): T {
  const tempDir = mkdtempSync(join(tmpdir(), prefix))

  try {
    return callback(tempDir)
  }
  finally {
    rmSync(tempDir, {recursive: true, force: true})
  }
}

function findBundledJitiChunkPath(): string | undefined {
  const bundledJitiChunkName = readdirSync(cliDistDir)
    .find(fileName => /^jiti-.*\.mjs$/u.test(fileName))

  return bundledJitiChunkName == null ? void 0 : resolve(cliDistDir, bundledJitiChunkName)
}

function syncSdkAssets(): void {
  if (!existsSync(sdkDistDir)) {
    throw new Error(`sdk dist directory is missing: ${sdkDistDir}`)
  }

  mkdirSync(cliDistDir, {recursive: true})

  for (const fileName of readdirSync(cliDistDir)) {
    if (!shouldCopyFromSdk(fileName)) continue
    rmSync(join(cliDistDir, fileName), {force: true, recursive: true})
  }

  for (const fileName of readdirSync(sdkDistDir)) {
    if (!shouldCopyFromSdk(fileName)) continue
    cpSync(join(sdkDistDir, fileName), join(cliDistDir, fileName), {recursive: true})
  }
}

function ensureBundledJitiRuntimeAssets(): void {
  if (findBundledJitiChunkPath() == null) return

  if (!existsSync(bundledJitiBabelRuntimeSourcePath)) {
    throw new Error(
      `Bundled jiti runtime asset is missing: ${bundledJitiBabelRuntimeSourcePath}`
    )
  }

  copyFileSync(bundledJitiBabelRuntimeSourcePath, bundledJitiBabelRuntimeTargetPath)
}

function ensureInternalCommandBridgeBundle(): void {
  if (!existsSync(internalCommandBridgePath) && existsSync(builtInternalCommandBridgePath)) {
    mkdirSync(dirname(internalCommandBridgePath), {recursive: true})
    rmSync(internalCommandBridgePath, {force: true})
    renameSync(builtInternalCommandBridgePath, internalCommandBridgePath)
  }

  if (existsSync(internalCommandBridgePath)) return

  throw new Error(
    `Expected bundled internal command bridge at "${internalCommandBridgePath}".`
  )
}

function smokeTestInternalCommandBridge(): void {
  const smokeTest = spawnSync(
    process.execPath,
    [internalCommandBridgePath, 'self-test'],
    {
      cwd: cliDir,
      encoding: 'utf8'
    }
  )

  assertProcessSucceeded(smokeTest, [
    `Bundled internal command bridge "${internalCommandBridgePath}" failed the runtime smoke test.`
  ])

  const stdout = smokeTest.stdout.trim()
  if (stdout !== '{"ok":true,"command":"self-test"}') {
    throw new Error(
      [
        `Bundled internal command bridge "${internalCommandBridgePath}" returned an unexpected result.`,
        'Expected: {"ok":true,"command":"self-test"}',
        `Actual: ${stdout || '(empty)'}`
      ].join('\n')
    )
  }
}

function smokeTestScriptRuntimeWorker(): void {
  if (!existsSync(scriptRuntimeWorkerPath)) {
    throw new Error(`Expected bundled script runtime worker at "${scriptRuntimeWorkerPath}".`)
  }

  withTempDir('tnmsc-script-runtime-worker-', tempDir => {
    const proxyModulePath = join(tempDir, 'proxy.ts')
    const contextJsonPath = join(tempDir, 'ctx.json')
    const expectedPath = '____git/config'

    writeFileSync(
      proxyModulePath,
      'export default { resolvePublicPath(logicalPath) { return logicalPath.replace(/^\\.git\\//, "____git/") } }\n',
      'utf8'
    )
    writeFileSync(
      contextJsonPath,
      JSON.stringify({
        cwd: tempDir,
        workspaceDir: tempDir,
        aindexDir: join(tempDir, '.aindex'),
        command: 'install',
        platform: process.platform
      }),
      'utf8'
    )

    const smokeTest = spawnSync(
      process.execPath,
      [scriptRuntimeWorkerPath, proxyModulePath, contextJsonPath, '.git/config'],
      {
        cwd: cliDir,
        encoding: 'utf8'
      }
    )

    assertProcessSucceeded(smokeTest, [
      `Bundled script runtime worker "${scriptRuntimeWorkerPath}" failed the runtime smoke test.`
    ])

    if (smokeTest.stdout.trim() !== expectedPath) {
      throw new Error(
        [
          `Bundled script runtime worker "${scriptRuntimeWorkerPath}" returned an unexpected path.`,
          `Expected: ${expectedPath}`,
          `Actual: ${smokeTest.stdout.trim() || '(empty)'}`
        ].join('\n')
      )
    }
  })
}

syncSdkAssets()
ensureBundledJitiRuntimeAssets()
ensureInternalCommandBridgeBundle()
smokeTestInternalCommandBridge()
smokeTestScriptRuntimeWorker()
