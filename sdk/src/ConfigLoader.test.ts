import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {ConfigLoader, getGlobalConfigPath} from './ConfigLoader'

describe('configLoader', () => {
  const originalHome = process.env.HOME
  const originalUserProfile = process.env.USERPROFILE
  const originalHomeDrive = process.env.HOMEDRIVE
  const originalHomePath = process.env.HOMEPATH

  afterEach(() => {
    process.env.HOME = originalHome
    process.env.USERPROFILE = originalUserProfile
    process.env.HOMEDRIVE = originalHomeDrive
    process.env.HOMEPATH = originalHomePath
  })

  it('searches only the canonical global config path', () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-home-'))
    process.env.HOME = tempHome
    process.env.USERPROFILE = tempHome
    delete process.env.HOMEDRIVE
    delete process.env.HOMEPATH

    try {
      const loader = new ConfigLoader()
      expect(loader.getSearchPaths(path.join(tempHome, 'workspace'))).toEqual([getGlobalConfigPath()])
    }
    finally {
      fs.rmSync(tempHome, {recursive: true, force: true})
    }
  })

  it('defaults aindex.softwares when loading an older config file', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-config-loader-'))
    const configPath = path.join(tempDir, '.tnmsc.json')

    try {
      fs.writeFileSync(configPath, JSON.stringify({
        workspaceDir: '/tmp/workspace',
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
        }
      }), 'utf8')

      const loader = new ConfigLoader()
      const result = loader.loadFromFile(configPath)

      expect(result.found).toBe(true)
      expect(result.config.aindex?.softwares).toEqual({src: 'softwares', dist: 'dist/softwares'})
    }
    finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })
})
