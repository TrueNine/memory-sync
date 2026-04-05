import type {OutputPlugin} from './plugins/plugin-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {defineConfig} from './config'
import {createLogger, PluginKind} from './plugins/plugin-core'

describe('defineConfig', () => {
  const originalHome = process.env['HOME']
  const originalUserProfile = process.env['USERPROFILE']
  const originalHomeDrive = process.env['HOMEDRIVE']
  const originalHomePath = process.env['HOMEPATH']

  afterEach(() => {
    process.env['HOME'] = originalHome
    process.env['USERPROFILE'] = originalUserProfile
    process.env['HOMEDRIVE'] = originalHomeDrive
    process.env['HOMEPATH'] = originalHomePath
    vi.restoreAllMocks()
  })

  it('loads config only from ~/.aindex/.tnmsc.json', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-workspace-'))
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-home-'))
    const globalConfigDir = path.join(tempHome, '.aindex')
    const globalConfigPath = path.join(globalConfigDir, '.tnmsc.json')
    const localConfigPath = path.join(tempWorkspace, '.tnmsc.json')

    process.env['HOME'] = tempHome
    process.env['USERPROFILE'] = tempHome
    delete process.env['HOMEDRIVE']
    delete process.env['HOMEPATH']

    fs.mkdirSync(globalConfigDir, {recursive: true})
    fs.writeFileSync(
      globalConfigPath,
      JSON.stringify({
        workspaceDir: tempWorkspace,
        logLevel: 'info'
      }),
      'utf8'
    )
    fs.writeFileSync(localConfigPath, JSON.stringify({workspaceDir: '/wrong/workspace', logLevel: 'error'}), 'utf8')

    try {
      const result = await defineConfig({cwd: tempWorkspace})

      expect(result.userConfigOptions.workspaceDir).toBe(tempWorkspace)
      expect(result.userConfigOptions.aindex.softwares).toEqual({src: 'softwares', dist: 'dist/softwares'})
      expect(result.context.workspace.directory.path).toBe(tempWorkspace)
      expect(result.context.aindexDir).toBe(path.join(tempWorkspace, 'aindex'))
    } finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
      fs.rmSync(tempHome, {recursive: true, force: true})
    }
  })

  it('passes pipeline args into public proxy resolution', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-public-proxy-command-'))
    const aindexDir = path.join(tempWorkspace, 'aindex')
    const publicDir = path.join(aindexDir, 'public')

    fs.mkdirSync(path.join(publicDir, 'execute'), {recursive: true})
    fs.mkdirSync(path.join(publicDir, 'dry-run'), {recursive: true})
    fs.writeFileSync(
      path.join(publicDir, 'proxy.ts'),
      ['export default (_logicalPath, ctx) => ctx.command === "dry-run"', '  ? "dry-run/gitignore"', '  : "execute/gitignore"', ''].join('\n'),
      'utf8'
    )
    fs.writeFileSync(path.join(publicDir, 'execute', 'gitignore'), 'execute\n', 'utf8')
    fs.writeFileSync(path.join(publicDir, 'dry-run', 'gitignore'), 'dry-run\n', 'utf8')

    try {
      const result = await defineConfig({
        loadUserConfig: false,
        runtimeCommand: 'dry-run',
        pluginOptions: {
          workspaceDir: tempWorkspace
        }
      })

      expect(result.context.globalGitIgnore).toBe('dry-run\n')
    } finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('keeps executionCwd separate from workspaceDir', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-execution-cwd-workspace-'))
    const externalCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-execution-cwd-external-'))

    try {
      const result = await defineConfig({
        loadUserConfig: false,
        executionCwd: externalCwd,
        pluginOptions: {
          workspaceDir: tempWorkspace
        }
      })

      expect(result.userConfigOptions.workspaceDir).toBe(tempWorkspace)
      expect(result.context.workspace.directory.path).toBe(tempWorkspace)
      expect(result.executionPlan.cwd).toBe(externalCwd)
      expect(result.executionPlan.workspaceDir).toBe(tempWorkspace)
      expect(result.executionPlan.scope).toBe('external')
    } finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
      fs.rmSync(externalCwd, {recursive: true, force: true})
    }
  })

  it('applies default codeStyles when user config omits them', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-code-styles-default-workspace-'))

    try {
      const result = await defineConfig({
        loadUserConfig: false,
        pluginOptions: {
          workspaceDir: tempWorkspace
        }
      })

      expect(result.userConfigOptions.codeStyles).toEqual({
        indent: 'space',
        tabSize: 2
      })
    } finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('uses executionCwd as the workspace root when workspaceDir is omitted', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-runtime-workspace-fallback-'))

    try {
      const result = await defineConfig({
        loadUserConfig: false,
        executionCwd: tempWorkspace
      })

      expect(result.userConfigOptions.workspaceDir).toBe(tempWorkspace)
      expect(result.context.workspace.directory.path).toBe(tempWorkspace)
      expect(result.executionPlan.cwd).toBe(tempWorkspace)
      expect(result.executionPlan.workspaceDir).toBe(tempWorkspace)
    } finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('returns programmatically assembled output plugins separately from user config options', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-output-plugin-assembly-'))
    const outputPlugin: OutputPlugin = {
      name: 'TestOutputPlugin',
      type: PluginKind.Output,
      log: createLogger('TestOutputPlugin', 'error'),
      declarativeOutput: true,
      outputCapabilities: {},
      async declareOutputFiles() {
        return []
      },
      async convertContent() {
        return ''
      }
    }

    try {
      const result = await defineConfig({
        loadUserConfig: false,
        outputPlugins: [outputPlugin],
        pluginOptions: {
          workspaceDir: tempWorkspace
        }
      })

      expect(result.outputPlugins).toEqual([outputPlugin])
      expect(result.userConfigOptions.plugins).toEqual({})
    } finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })
})
