import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {defineConfig} from './config'
import {WorkspaceInputPlugin} from './inputs/input-workspace'

describe('defineConfig', () => {
  afterEach(() => vi.restoreAllMocks())

  it('loads a project-local config when no global config is available', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-workspace-'))

    const localConfigPath = path.join(tempWorkspace, '.tnmsc.json')
    fs.writeFileSync(localConfigPath, JSON.stringify({
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

    try {
      const result = await defineConfig({
        cwd: tempWorkspace,
        configLoaderOptions: {searchGlobal: false},
        pluginOptions: {
          plugins: [new WorkspaceInputPlugin()]
        }
      })

      expect(result.userConfigOptions.workspaceDir).toBe(tempWorkspace)
      expect(result.context.workspace.directory.path).toBe(tempWorkspace)
      expect(result.context.aindexDir).toBe(path.join(tempWorkspace, 'aindex'))
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })
})
