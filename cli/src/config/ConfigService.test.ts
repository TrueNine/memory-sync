/**
 * Unit tests for ConfigService
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {ConfigService, getDefaultConfigPath} from './ConfigService'
import {
  ConfigFileNotFoundError,
  ConfigParseError,
  ConfigValidationError
} from './errors'

describe('configService', () => {
  let tempDir: string,
    configService: ConfigService

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-config-test-'))
    ConfigService.resetInstance()
    configService = ConfigService.getInstance({configPath: path.join(tempDir, '.tnmsc.json')})
  })

  afterEach(() => {
    ConfigService.resetInstance()
    try { // Clean up temp directory
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
    catch {
    } // Ignore cleanup errors
  })

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = ConfigService.getInstance()
      const instance2 = ConfigService.getInstance()
      expect(instance1).toBe(instance2)
    })

    it('should create new instance after reset', () => {
      const instance1 = ConfigService.getInstance()
      ConfigService.resetInstance()
      const instance2 = ConfigService.getInstance()
      expect(instance1).not.toBe(instance2)
    })
  })

  describe('load', () => {
    it('should load valid configuration', () => {
      const validConfig = {
        version: '2026.10218.12101',
        workspaceDir: '~/project',
        aindex: {
          name: 'aindex',
          skills: {src: 'skills', dist: 'dist/skills'},
          commands: {src: 'commands', dist: 'dist/commands'},
          subAgents: {src: 'agents', dist: 'dist/agents'},
          rules: {src: 'rules', dist: 'dist/rules'},
          globalPrompt: {src: 'app/global.cn.mdx', dist: 'dist/global.mdx'},
          workspacePrompt: {src: 'app/workspace.cn.mdx', dist: 'dist/workspace.mdx'},
          app: {src: 'app', dist: 'dist/app'},
          ext: {src: 'ext', dist: 'dist/ext'},
          arch: {src: 'arch', dist: 'dist/arch'}
        },
        logLevel: 'info',
        profile: {
          name: 'Test User',
          username: 'testuser',
          gender: 'male',
          birthday: '1990-01-01'
        }
      }

      fs.writeFileSync(configService.getConfigPath(), JSON.stringify(validConfig, null, 2))

      const config = configService.load()

      expect(config.version).toBe('2026.10218.12101')
      expect(config.workspaceDir).toBe('~/project')
      expect(config.logLevel).toBe('info')
      expect(config.profile.name).toBe('Test User')
      expect(config.aindex.name).toBe('aindex')
      expect(config.aindex.skills.src).toBe('skills')
    })

    it('should throw ConfigFileNotFoundError for missing file', () => {
      expect(() => configService.load()).toThrow(ConfigFileNotFoundError)
    })

    it('should throw ConfigParseError for invalid JSON', () => {
      fs.writeFileSync(configService.getConfigPath(), 'not valid json')
      expect(() => configService.load()).toThrow(ConfigParseError)
    })

    it('should throw ConfigValidationError for missing required fields', () => {
      const invalidConfig = {
        version: '2026.10218.12101'
      } // missing workspaceDir, aindex, logLevel, profile

      fs.writeFileSync(configService.getConfigPath(), JSON.stringify(invalidConfig))
      expect(() => configService.load()).toThrow(ConfigValidationError)
    })

    it('should throw ConfigValidationError for invalid version format', () => {
      const invalidConfig = {
        version: 'invalid-version',
        workspaceDir: '~/project',
        aindex: {
          name: 'aindex',
          skills: {src: 'skills', dist: 'dist/skills'},
          commands: {src: 'commands', dist: 'dist/commands'},
          subAgents: {src: 'agents', dist: 'dist/agents'},
          rules: {src: 'rules', dist: 'dist/rules'},
          globalPrompt: {src: 'app/global.cn.mdx', dist: 'dist/global.mdx'},
          workspacePrompt: {src: 'app/workspace.cn.mdx', dist: 'dist/workspace.mdx'},
          app: {src: 'app', dist: 'dist/app'},
          ext: {src: 'ext', dist: 'dist/ext'},
          arch: {src: 'arch', dist: 'dist/arch'}
        },
        logLevel: 'info',
        profile: {
          name: 'Test User',
          username: 'testuser',
          gender: 'male',
          birthday: '1990-01-01'
        }
      }

      fs.writeFileSync(configService.getConfigPath(), JSON.stringify(invalidConfig))
      expect(() => configService.load()).toThrow(ConfigValidationError)
    })

    it('should throw ConfigValidationError for invalid logLevel', () => {
      const invalidConfig = {
        version: '2026.10218.12101',
        workspaceDir: '~/project',
        aindex: {
          name: 'aindex',
          skills: {src: 'skills', dist: 'dist/skills'},
          commands: {src: 'commands', dist: 'dist/commands'},
          subAgents: {src: 'agents', dist: 'dist/agents'},
          rules: {src: 'rules', dist: 'dist/rules'},
          globalPrompt: {src: 'app/global.cn.mdx', dist: 'dist/global.mdx'},
          workspacePrompt: {src: 'app/workspace.cn.mdx', dist: 'dist/workspace.mdx'},
          app: {src: 'app', dist: 'dist/app'},
          ext: {src: 'ext', dist: 'dist/ext'},
          arch: {src: 'arch', dist: 'dist/arch'}
        },
        logLevel: 'invalid-level',
        profile: {
          name: 'Test User',
          username: 'testuser',
          gender: 'male',
          birthday: '1990-01-01'
        }
      }

      fs.writeFileSync(configService.getConfigPath(), JSON.stringify(invalidConfig))
      expect(() => configService.load()).toThrow(ConfigValidationError)
    })
  })

  describe('safeLoad', () => {
    it('should return config when file exists', () => {
      const validConfig = {
        version: '2026.10218.12101',
        workspaceDir: '~/project',
        aindex: {
          name: 'aindex',
          skills: {src: 'skills', dist: 'dist/skills'},
          commands: {src: 'commands', dist: 'dist/commands'},
          subAgents: {src: 'agents', dist: 'dist/agents'},
          rules: {src: 'rules', dist: 'dist/rules'},
          globalPrompt: {src: 'app/global.cn.mdx', dist: 'dist/global.mdx'},
          workspacePrompt: {src: 'app/workspace.cn.mdx', dist: 'dist/workspace.mdx'},
          app: {src: 'app', dist: 'dist/app'},
          ext: {src: 'ext', dist: 'dist/ext'},
          arch: {src: 'arch', dist: 'dist/arch'}
        },
        logLevel: 'info',
        profile: {
          name: 'Test User',
          username: 'testuser',
          gender: 'male',
          birthday: '1990-01-01'
        }
      }

      fs.writeFileSync(configService.getConfigPath(), JSON.stringify(validConfig, null, 2))

      const result = configService.safeLoad()

      expect(result.found).toBe(true)
      expect(result.source).toBe(configService.getConfigPath())
      expect(result.config.version).toBe('2026.10218.12101')
    })

    it('should return default config when file not found', () => {
      const result = configService.safeLoad()

      expect(result.found).toBe(false)
      expect(result.config).toBeDefined()
      expect(result.config.workspaceDir).toBe('~/project')
    })

    it('should throw for invalid JSON even in safeLoad', () => {
      fs.writeFileSync(configService.getConfigPath(), 'not valid json')
      expect(() => configService.safeLoad()).toThrow(ConfigParseError)
    })
  })

  describe('reload', () => {
    it('should reload configuration from disk', () => {
      const config1 = {
        version: '2026.10218.12101',
        workspaceDir: '~/project',
        aindex: {
          name: 'aindex',
          skills: {src: 'skills', dist: 'dist/skills'},
          commands: {src: 'commands', dist: 'dist/commands'},
          subAgents: {src: 'agents', dist: 'dist/agents'},
          rules: {src: 'rules', dist: 'dist/rules'},
          globalPrompt: {src: 'app/global.cn.mdx', dist: 'dist/global.mdx'},
          workspacePrompt: {src: 'app/workspace.cn.mdx', dist: 'dist/workspace.mdx'},
          app: {src: 'app', dist: 'dist/app'},
          ext: {src: 'ext', dist: 'dist/ext'},
          arch: {src: 'arch', dist: 'dist/arch'}
        },
        logLevel: 'info',
        profile: {
          name: 'Test User',
          username: 'testuser',
          gender: 'male',
          birthday: '1990-01-01'
        }
      }

      fs.writeFileSync(configService.getConfigPath(), JSON.stringify(config1))
      configService.load()

      const config2 = {
        ...config1,
        version: '2026.10219.00000'
      }

      fs.writeFileSync(configService.getConfigPath(), JSON.stringify(config2))
      const reloaded = configService.reload()

      expect(reloaded.version).toBe('2026.10219.00000')
    })
  })

  describe('getConfig', () => {
    it('should return loaded configuration', () => {
      const validConfig = {
        version: '2026.10218.12101',
        workspaceDir: '~/project',
        aindex: {
          name: 'aindex',
          skills: {src: 'skills', dist: 'dist/skills'},
          commands: {src: 'commands', dist: 'dist/commands'},
          subAgents: {src: 'agents', dist: 'dist/agents'},
          rules: {src: 'rules', dist: 'dist/rules'},
          globalPrompt: {src: 'app/global.cn.mdx', dist: 'dist/global.mdx'},
          workspacePrompt: {src: 'app/workspace.cn.mdx', dist: 'dist/workspace.mdx'},
          app: {src: 'app', dist: 'dist/app'},
          ext: {src: 'ext', dist: 'dist/ext'},
          arch: {src: 'arch', dist: 'dist/arch'}
        },
        logLevel: 'info',
        profile: {
          name: 'Test User',
          username: 'testuser',
          gender: 'male',
          birthday: '1990-01-01'
        }
      }

      fs.writeFileSync(configService.getConfigPath(), JSON.stringify(validConfig))
      configService.load()

      const config = configService.getConfig()
      expect(config.version).toBe('2026.10218.12101')
    })

    it('should throw if configuration not loaded', () => {
      expect(() => configService.getConfig()).toThrow('Configuration has not been loaded')
    })
  })

  describe('isLoaded', () => {
    it('should return false before loading', () => expect(configService.isLoaded()).toBe(false))

    it('should return true after loading', () => {
      const validConfig = {
        version: '2026.10218.12101',
        workspaceDir: '~/project',
        aindex: {
          name: 'aindex',
          skills: {src: 'skills', dist: 'dist/skills'},
          commands: {src: 'commands', dist: 'dist/commands'},
          subAgents: {src: 'agents', dist: 'dist/agents'},
          rules: {src: 'rules', dist: 'dist/rules'},
          globalPrompt: {src: 'app/global.cn.mdx', dist: 'dist/global.mdx'},
          workspacePrompt: {src: 'app/workspace.cn.mdx', dist: 'dist/workspace.mdx'},
          app: {src: 'app', dist: 'dist/app'},
          ext: {src: 'ext', dist: 'dist/ext'},
          arch: {src: 'arch', dist: 'dist/arch'}
        },
        logLevel: 'info',
        profile: {
          name: 'Test User',
          username: 'testuser',
          gender: 'male',
          birthday: '1990-01-01'
        }
      }

      fs.writeFileSync(configService.getConfigPath(), JSON.stringify(validConfig))
      configService.load()

      expect(configService.isLoaded()).toBe(true)
    })
  })

  describe('getDefaultConfigPath', () => {
    it('should return path in home directory', () => {
      const defaultPath = getDefaultConfigPath()
      expect(defaultPath).toContain('.aindex')
      expect(defaultPath).toContain('.tnmsc.json')
      expect(path.isAbsolute(defaultPath)).toBe(true)
    })
  })
})
