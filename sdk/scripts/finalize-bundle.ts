import {spawnSync} from 'node:child_process'
import {copyFileSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import markdownOutput from '../../scripts/markdown-output'

const {writeMarkdownBlock} = markdownOutput

const scriptDir = dirname(fileURLToPath(import.meta.url))
const cliDir = resolve(scriptDir, '..')
const distDir = resolve(cliDir, 'dist')
const indexEntryPath = resolve(distDir, 'index.mjs')
const bundledJitiBabelRuntimeSourcePath = resolve(cliDir, 'node_modules', 'jiti', 'dist', 'babel.cjs')
const bundledJitiBabelRuntimeTargetPath = resolve(distDir, 'babel.cjs')

function getCombinedOutput(stdout?: string | null, stderr?: string | null): string {
  return `${stdout ?? ''}${stderr ?? ''}`.trim()
}

function runNodeProcess(
  args: readonly string[],
  options?: {
    readonly env?: NodeJS.ProcessEnv
  }
) {
  return spawnSync(process.execPath, [...args], {
    cwd: cliDir,
    encoding: 'utf8',
    ...options?.env != null && {env: options.env}
  })
}

function assertProcessSucceeded(
  result: ReturnType<typeof runNodeProcess>,
  lines: readonly string[]
): void {
  if (result.error != null) {
    throw result.error
  }

  if (result.status === 0) {
    return
  }

  const combinedOutput = getCombinedOutput(result.stdout, result.stderr)
  throw new Error([
    ...lines,
    combinedOutput.length === 0 ? 'No output captured.' : combinedOutput
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

function ensureIndexBundleExists(): void {
  if (existsSync(indexEntryPath)) return
  throw new Error(`Expected bundled CLI entry at "${indexEntryPath}" before finalizing bundle assets.`)
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

function smokeTestBundledJitiTransform(bundledJitiChunkPath: string | undefined): void {
  if (bundledJitiChunkPath == null) return

  withTempDir('tnmsc-bundled-jiti-', tempDir => {
    const probeModulePath = join(tempDir, 'probe.ts')
    const probeRunnerPath = join(tempDir, 'probe-runner.mjs')

    writeFileSync(probeModulePath, 'export default {ok: true}\n', 'utf8')
    writeFileSync(probeRunnerPath, [
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

    const smokeTest = runNodeProcess([probeRunnerPath, bundledJitiChunkPath, probeModulePath])
    assertProcessSucceeded(smokeTest, [
      `Bundled jiti chunk "${pathToFileURL(bundledJitiChunkPath).href}" failed the transform smoke test.`
    ])
  })
}

function smokeTestCliEntry(): void {
  withTempDir('tnmsc-index-entry-home-', isolatedHomeDir => {
    const smokeTest = runNodeProcess([indexEntryPath, '--version'], {
      env: {
        ...process.env,
        HOME: isolatedHomeDir,
        USERPROFILE: isolatedHomeDir
      }
    })

    assertProcessSucceeded(smokeTest, [
      `Bundled CLI entry "${indexEntryPath}" failed the runtime smoke test.`,
      `Exit code: ${smokeTest.status ?? 'unknown'}`
    ])
  })
}

ensureIndexBundleExists()
const bundledJitiChunkPath = ensureBundledJitiRuntimeAssets()
smokeTestBundledJitiTransform(bundledJitiChunkPath)
smokeTestCliEntry()

writeMarkdownBlock('Bundled CLI assets finalized', {
  entry: indexEntryPath,
})
