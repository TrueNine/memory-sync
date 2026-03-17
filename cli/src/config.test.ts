import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {defineConfig} from './config'
import {WorkspaceInputCapability} from './inputs/input-workspace'

describe('defineConfig', () => {
  const originalHome = process.env.HOME
  const originalUserProfile = process.env.USERPROFILE
  const originalHomeDrive = process.env.HOMEDRIVE
  const originalHomePath = process.env.HOMEPATH

  afterEach(() => {
    process.env.HOME = originalHome
    process.env.USERPROFILE = originalUserProfile
    process.env.HOMEDRIVE = originalHomeDrive
    process.env.HOMEPATH = originalHomePath
    vi.restoreAllMocks()
  })

  it('loads config only from ~/.aindex/.tnmsc.json', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-workspace-'))
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-home-'))
    const globalConfigDir = path.join(tempHome, '.aindex')
    const globalConfigPath = path.join(globalConfigDir, '.tnmsc.json')
    const localConfigPath = path.join(tempWorkspace, '.tnmsc.json')

    process.env.HOME = tempHome
    process.env.USERPROFILE = tempHome
    delete process.env.HOMEDRIVE
    delete process.env.HOMEPATH

    fs.mkdirSync(globalConfigDir, {recursive: true})
    fs.writeFileSync(globalConfigPath, JSON.stringify({
      workspaceDir: tempWorkspace,
      aindex: {
        dir: 'aindex',
        skills: {src: 'skills', dist: 'dist/skills'},
        commands: {src: 'commands', dist: 'dist/commands'},
        subAgents: {src: 'subagents', dist: 'dist/subagents'},
        rules: {src: 'rules', dist: 'dist/rules'},
        globalPrompt: {src: 'global.src.mdx', dist: 'dist/global.mdx'},
        workspacePrompt: {src: 'workspace.src.mdx', dist: 'dist/workspace.mdx'},
        app: {src: 'app', dist: 'dist/app'},
        ext: {src: 'ext', dist: 'dist/ext'},
        arch: {src: 'arch', dist: 'dist/arch'}
      },
      logLevel: 'info'
    }), 'utf8')
    fs.writeFileSync(localConfigPath, JSON.stringify({workspaceDir: '/wrong/workspace', logLevel: 'error'}), 'utf8')

    try {
      const result = await defineConfig({cwd: tempWorkspace})

      expect(result.userConfigOptions.workspaceDir).toBe(tempWorkspace)
      expect(result.context.workspace.directory.path).toBe(tempWorkspace)
      expect(result.context.aindexDir).toBe(path.join(tempWorkspace, 'aindex'))
    }
    finally {
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
    fs.writeFileSync(path.join(publicDir, 'proxy.ts'), [
      'export default (_logicalPath, ctx) => ctx.command === "dry-run"',
      '  ? "dry-run/gitignore"',
      '  : "execute/gitignore"',
      ''
    ].join('\n'), 'utf8')
    fs.writeFileSync(path.join(publicDir, 'execute', 'gitignore'), 'execute\n', 'utf8')
    fs.writeFileSync(path.join(publicDir, 'dry-run', 'gitignore'), 'dry-run\n', 'utf8')

    try {
      const result = await defineConfig({
        loadUserConfig: false,
        pipelineArgs: ['node', 'tnmsc', 'dry-run'],
        pluginOptions: {
          workspaceDir: tempWorkspace
        }
      })

      expect(result.context.globalGitIgnore).toBe('dry-run\n')
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('does not run builtin mutating input effects when plugins is explicitly empty', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-explicit-empty-plugins-'))
    const orphanSkillDir = path.join(tempWorkspace, 'aindex', 'dist', 'skills', 'orphan-skill')
    const orphanSkillFile = path.join(orphanSkillDir, 'SKILL.md')

    fs.mkdirSync(orphanSkillDir, {recursive: true})
    fs.writeFileSync(orphanSkillFile, 'orphan\n', 'utf8')

    try {
      const result = await defineConfig({
        loadUserConfig: false,
        pluginOptions: {
          workspaceDir: tempWorkspace,
          plugins: []
        }
      })

      expect(result.context.workspace.directory.path).toBe(tempWorkspace)
      expect(fs.existsSync(orphanSkillFile)).toBe(true)
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('accepts legacy input capabilities in pluginOptions.plugins without crashing', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-legacy-input-capabilities-'))

    try {
      const result = await defineConfig({
        loadUserConfig: false,
        pluginOptions: {
          workspaceDir: tempWorkspace,
          plugins: [new WorkspaceInputCapability()]
        }
      })

      expect(result.context.workspace.directory.path).toBe(tempWorkspace)
      expect(result.outputPlugins).toEqual([])
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })
})
