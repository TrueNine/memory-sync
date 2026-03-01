/**
 * Unit tests for schema validation
 */

import type {TnmscConfig} from './types'
import {describe, expect, it} from 'vitest'
import {
  formatValidationErrors,
  getDefaultConfig,
  isValidLogLevel,
  safeValidateConfig,
  validateConfig,
  ZAindexConfig,
  ZModulePaths,
  ZProfile,
  ZTnmscConfig
} from './schema'

describe('schema validation', () => {
  const validConfig: TnmscConfig = {
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
      name: '赵日天',
      username: 'TrueNine',
      gender: 'male',
      birthday: '1997-11-04'
    }
  }

  describe('zModulePaths', () => {
    it('should validate valid module paths', () => {
      const result = ZModulePaths.safeParse({src: 'skills', dist: 'dist/skills'})
      expect(result.success).toBe(true)
    })

    it('should reject empty src path', () => {
      const result = ZModulePaths.safeParse({src: '', dist: 'dist/skills'})
      expect(result.success).toBe(false)
    })

    it('should reject empty dist path', () => {
      const result = ZModulePaths.safeParse({src: 'skills', dist: ''})
      expect(result.success).toBe(false)
    })

    it('should reject missing src', () => {
      const result = ZModulePaths.safeParse({dist: 'dist/skills'})
      expect(result.success).toBe(false)
    })

    it('should reject missing dist', () => {
      const result = ZModulePaths.safeParse({src: 'skills'})
      expect(result.success).toBe(false)
    })
  })

  describe('zAindexConfig', () => {
    it('should validate valid aindex config', () => {
      const result = ZAindexConfig.safeParse(validConfig.aindex)
      expect(result.success).toBe(true)
    })

    it('should reject empty name', () => {
      const invalidConfig = {
        ...validConfig.aindex,
        name: ''
      }
      const result = ZAindexConfig.safeParse(invalidConfig)
      expect(result.success).toBe(false)
    })

    it('should reject missing skills', () => {
      const {skills: _, ...invalidConfig} = validConfig.aindex
      const result = ZAindexConfig.safeParse(invalidConfig)
      expect(result.success).toBe(false)
    })

    it('should reject invalid skills paths', () => {
      const invalidConfig = {
        ...validConfig.aindex,
        skills: {src: '', dist: 'dist/skills'}
      }
      const result = ZAindexConfig.safeParse(invalidConfig)
      expect(result.success).toBe(false)
    })
  })

  describe('zProfile', () => {
    it('should validate valid profile', () => {
      const result = ZProfile.safeParse(validConfig.profile)
      expect(result.success).toBe(true)
    })

    it('should reject empty name', () => {
      const invalidProfile = {...validConfig.profile, name: ''}
      const result = ZProfile.safeParse(invalidProfile)
      expect(result.success).toBe(false)
    })

    it('should reject empty username', () => {
      const invalidProfile = {...validConfig.profile, username: ''}
      const result = ZProfile.safeParse(invalidProfile)
      expect(result.success).toBe(false)
    })

    it('should reject empty gender', () => {
      const invalidProfile = {...validConfig.profile, gender: ''}
      const result = ZProfile.safeParse(invalidProfile)
      expect(result.success).toBe(false)
    })

    it('should reject invalid birthday format', () => {
      const invalidProfile = {...validConfig.profile, birthday: '1997/11/04'}
      const result = ZProfile.safeParse(invalidProfile)
      expect(result.success).toBe(false)
    })

    it('should reject birthday without leading zeros', () => {
      const invalidProfile = {...validConfig.profile, birthday: '1997-1-4'}
      const result = ZProfile.safeParse(invalidProfile)
      expect(result.success).toBe(false)
    })
  })

  describe('zTnmscConfig', () => {
    it('should validate valid configuration', () => {
      const result = ZTnmscConfig.safeParse(validConfig)
      expect(result.success).toBe(true)
    })

    it('should reject missing version', () => {
      const {version: _, ...invalidConfig} = validConfig
      const result = ZTnmscConfig.safeParse(invalidConfig)
      expect(result.success).toBe(false)
    })

    it('should reject missing workspaceDir', () => {
      const {workspaceDir: _, ...invalidConfig} = validConfig
      const result = ZTnmscConfig.safeParse(invalidConfig)
      expect(result.success).toBe(false)
    })

    it('should reject missing aindex', () => {
      const {aindex: _, ...invalidConfig} = validConfig
      const result = ZTnmscConfig.safeParse(invalidConfig)
      expect(result.success).toBe(false)
    })

    it('should reject missing logLevel', () => {
      const {logLevel: _, ...invalidConfig} = validConfig
      const result = ZTnmscConfig.safeParse(invalidConfig)
      expect(result.success).toBe(false)
    })

    it('should reject missing profile', () => {
      const {profile: _, ...invalidConfig} = validConfig
      const result = ZTnmscConfig.safeParse(invalidConfig)
      expect(result.success).toBe(false)
    })

    it('should reject invalid version format', () => {
      const invalidConfig = {...validConfig, version: '1.0.0'}
      const result = ZTnmscConfig.safeParse(invalidConfig)
      expect(result.success).toBe(false)
    })

    it('should reject version without dots', () => {
      const invalidConfig = {...validConfig, version: '20261021812101'}
      const result = ZTnmscConfig.safeParse(invalidConfig)
      expect(result.success).toBe(false)
    })

    it('should reject empty workspaceDir', () => {
      const invalidConfig = {...validConfig, workspaceDir: ''}
      const result = ZTnmscConfig.safeParse(invalidConfig)
      expect(result.success).toBe(false)
    })

    it('should reject invalid logLevel', () => {
      const invalidConfig = {...validConfig, logLevel: 'verbose'}
      const result = ZTnmscConfig.safeParse(invalidConfig)
      expect(result.success).toBe(false)
    })

    it('should accept all valid log levels', () => {
      const validLevels = ['trace', 'debug', 'info', 'warn', 'error'] as const
      for (const level of validLevels) {
        const testConfig = {...validConfig, logLevel: level}
        const result = ZTnmscConfig.safeParse(testConfig)
        expect(result.success).toBe(true)
      }
    })
  })

  describe('validateConfig', () => {
    it('should return validated config for valid input', () => {
      const result = validateConfig(validConfig)
      expect(result.version).toBe('2026.10218.12101')
      expect(result.workspaceDir).toBe('~/project')
    })

    it('should throw for invalid config', () => {
      expect(() => validateConfig({})).toThrow()
    })
  })

  describe('safeValidateConfig', () => {
    it('should return success for valid config', () => {
      const result = safeValidateConfig(validConfig)
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.version).toBe('2026.10218.12101')
    })

    it('should return failure for invalid config', () => {
      const result = safeValidateConfig({})
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error).toBeDefined()
    })
  })

  describe('formatValidationErrors', () => {
    it('should format validation errors', () => {
      const result = safeValidateConfig({})
      expect(result.success).toBe(false)

      if (result.success) return

      const formatted = formatValidationErrors(result.error)
      expect(formatted.length).toBeGreaterThan(0)
      expect(formatted[0]).toContain(':')
    })
  })

  describe('isValidLogLevel', () => {
    it('should return true for valid log levels', () => {
      expect(isValidLogLevel('trace')).toBe(true)
      expect(isValidLogLevel('debug')).toBe(true)
      expect(isValidLogLevel('info')).toBe(true)
      expect(isValidLogLevel('warn')).toBe(true)
      expect(isValidLogLevel('error')).toBe(true)
    })

    it('should return false for invalid log levels', () => {
      expect(isValidLogLevel('verbose')).toBe(false)
      expect(isValidLogLevel('warning')).toBe(false)
      expect(isValidLogLevel('')).toBe(false)
      expect(isValidLogLevel(null)).toBe(false)
      expect(isValidLogLevel(void 0)).toBe(false)
      expect(isValidLogLevel(123)).toBe(false)
    })
  })

  describe('getDefaultConfig', () => {
    it('should return default configuration', () => {
      const defaults = getDefaultConfig()
      expect(defaults.version).toBe('2026.00000.00000')
      expect(defaults.workspaceDir).toBe('~/project')
      expect(defaults.logLevel).toBe('info')
      expect(defaults.aindex).toBeDefined()
      expect(defaults.aindex?.name).toBe('aindex')
      expect(defaults.profile).toBeDefined()
    })

    it('should have all aindex modules in default config', () => {
      const defaults = getDefaultConfig()
      const aindex = defaults.aindex!

      expect(aindex.skills).toEqual({src: 'skills', dist: 'dist/skills'})
      expect(aindex.commands).toEqual({src: 'commands', dist: 'dist/commands'})
      expect(aindex.subAgents).toEqual({src: 'agents', dist: 'dist/agents'})
      expect(aindex.rules).toEqual({src: 'rules', dist: 'dist/rules'})
      expect(aindex.globalPrompt).toEqual({src: 'app/global.cn.mdx', dist: 'dist/global.mdx'})
      expect(aindex.workspacePrompt).toEqual({src: 'app/workspace.cn.mdx', dist: 'dist/workspace.mdx'})
      expect(aindex.app).toEqual({src: 'app', dist: 'dist/app'})
      expect(aindex.ext).toEqual({src: 'ext', dist: 'dist/ext'})
      expect(aindex.arch).toEqual({src: 'arch', dist: 'dist/arch'})
    })
  })
})
