import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {ConfigLoader, getGlobalConfigPath} from './ConfigLoader'

describe('configLoader', () => {
  const originalHome = process.env['HOME']
  const originalUserProfile = process.env['USERPROFILE']
  const originalHomeDrive = process.env['HOMEDRIVE']
  const originalHomePath = process.env['HOMEPATH']

  afterEach(() => {
    process.env['HOME'] = originalHome
    process.env['USERPROFILE'] = originalUserProfile
    process.env['HOMEDRIVE'] = originalHomeDrive
    process.env['HOMEPATH'] = originalHomePath
  })

  it('searches only the canonical global config path', () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-home-'))
    process.env['HOME'] = tempHome
    process.env['USERPROFILE'] = tempHome
    delete process.env['HOMEDRIVE']
    delete process.env['HOMEPATH']

    try {
      const loader = new ConfigLoader()
      expect(loader.getSearchPaths(path.join(tempHome, 'workspace'))).toEqual([getGlobalConfigPath()])
    }
    finally {
      fs.rmSync(tempHome, {recursive: true, force: true})
    }
  })

  it('ignores removed root-level aindex path fields', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-config-loader-'))
    const configPath = path.join(tempDir, '.tnmsc.json')

    try {
      fs.writeFileSync(configPath, JSON.stringify({
        workspaceDir: '/tmp/workspace',
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
      }), 'utf8')

      const loader = new ConfigLoader()
      const result = loader.loadFromFile(configPath)

      expect(result.found).toBe(true)
      expect(result.config).toEqual({
        workspaceDir: '/tmp/workspace'
      })
    }
    finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })

  it('ignores the removed legacy nested aindex wrapper', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-config-loader-legacy-'))
    const configPath = path.join(tempDir, '.tnmsc.json')

    try {
      fs.writeFileSync(configPath, JSON.stringify({
        workspaceDir: '/tmp/workspace',
        aindex: {
          skills: {src: 'skills', dist: 'dist/skills'},
          commands: {src: 'commands', dist: 'dist/commands'}
        }
      }), 'utf8')

      const loader = new ConfigLoader()
      const result = loader.loadFromFile(configPath)

      expect(result.found).toBe(true)
      expect(result.config).toEqual({
        workspaceDir: '/tmp/workspace'
      })
    }
    finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })

  it('loads codeStyles from the user config file', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-config-loader-code-styles-'))
    const configPath = path.join(tempDir, '.tnmsc.json')

    try {
      fs.writeFileSync(configPath, JSON.stringify({
        workspaceDir: '/tmp/workspace',
        codeStyles: {
          indent: 'space',
          tabSize: 2,
          quoteStyle: 'single'
        }
      }), 'utf8')

      const loader = new ConfigLoader()
      const result = loader.loadFromFile(configPath)

      expect(result.found).toBe(true)
      expect(result.config).toEqual({
        workspaceDir: '/tmp/workspace',
        codeStyles: {
          indent: 'space',
          tabSize: 2,
          quoteStyle: 'single'
        }
      })
    }
    finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })

  it('fills missing codeStyles fields with defaults when the block exists', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-config-loader-code-styles-defaults-'))
    const configPath = path.join(tempDir, '.tnmsc.json')

    try {
      fs.writeFileSync(configPath, JSON.stringify({
        codeStyles: {
          tabSize: 4
        }
      }), 'utf8')

      const loader = new ConfigLoader()
      const result = loader.loadFromFile(configPath)

      expect(result.found).toBe(true)
      expect(result.config).toEqual({
        codeStyles: {
          indent: 'space',
          tabSize: 4
        }
      })
    }
    finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })

  it('loads plugin enablement flags from the user config file', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-config-loader-plugins-'))
    const configPath = path.join(tempDir, '.tnmsc.json')

    try {
      fs.writeFileSync(configPath, JSON.stringify({
        plugins: {
          trae: true,
          claudeCode: false
        }
      }), 'utf8')

      const loader = new ConfigLoader()
      const result = loader.loadFromFile(configPath)

      expect(result.found).toBe(true)
      expect(result.config).toEqual({
        plugins: {
          trae: true,
          claudeCode: false
        }
      })
    }
    finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })

  it('throws when plugins contains an unsupported key', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-config-loader-plugins-invalid-'))
    const configPath = path.join(tempDir, '.tnmsc.json')

    try {
      fs.writeFileSync(configPath, JSON.stringify({
        plugins: {
          vscode: true,
          codex: true,
          foo: true
        }
      }), 'utf8')

      const loader = new ConfigLoader()

      expect(() => loader.loadFromFile(configPath)).toThrowError(
        /Unsupported plugins key "foo"\. Supported keys:/
      )
    }
    finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })
})
