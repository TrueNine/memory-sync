import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {ConfigLoader, DEFAULT_CONFIG_FILE_NAME, DEFAULT_GLOBAL_CONFIG_DIR, loadUserConfig} from './ConfigLoader'

// Mock fs module
vi.mock('node:fs')
vi.mock('node:os')

describe('configLoader', () => {
  const mockHomedir = '/home/testuser'
  const mockCwd = '/workspace/project'

  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue(mockHomedir)
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.readFileSync).mockReturnValue('{}')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getSearchPaths', () => {
    it('should return default search paths', () => {
      const loader = new ConfigLoader()
      const paths = loader.getSearchPaths(mockCwd)

      expect(paths).toContain(path.join(mockCwd, DEFAULT_CONFIG_FILE_NAME))
      expect(paths).toContain(path.join(mockHomedir, DEFAULT_GLOBAL_CONFIG_DIR, DEFAULT_CONFIG_FILE_NAME))
    })

    it('should respect searchCwd option', () => {
      const loader = new ConfigLoader({searchCwd: false})
      const paths = loader.getSearchPaths(mockCwd)

      expect(paths).not.toContain(path.join(mockCwd, DEFAULT_CONFIG_FILE_NAME))
    })

    it('should respect searchGlobal option', () => {
      const loader = new ConfigLoader({searchGlobal: false})
      const paths = loader.getSearchPaths(mockCwd)

      expect(paths).not.toContain(path.join(mockHomedir, DEFAULT_GLOBAL_CONFIG_DIR, DEFAULT_CONFIG_FILE_NAME))
    })

    it('should include custom search paths', () => {
      const customPath = '/custom/config/path'
      const loader = new ConfigLoader({searchPaths: [customPath]})
      const paths = loader.getSearchPaths(mockCwd)

      expect(paths[0]).toBe(customPath)
    })

    it('should resolve tilde in custom paths', () => {
      const loader = new ConfigLoader({searchPaths: ['~/custom/.tnmsc.json']})
      const paths = loader.getSearchPaths(mockCwd)

      expect(paths[0]).toBe(path.join(mockHomedir, 'custom/.tnmsc.json'))
    })
  })

  describe('loadFromFile', () => {
    it('should return empty config when file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const loader = new ConfigLoader()
      const result = loader.loadFromFile('/nonexistent/.tnmsc.json')

      expect(result.found).toBe(false)
      expect(result.config).toEqual({})
      expect(result.source).toBeNull()
    })

    it('should load valid config file', () => {
      const configContent = JSON.stringify({
        workspaceDir: '~/myworkspace',
        logLevel: 'debug',
      })

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(configContent)

      const loader = new ConfigLoader()
      const result = loader.loadFromFile('/test/.tnmsc.json')

      expect(result.found).toBe(true)
      expect(result.config.workspaceDir).toBe('~/myworkspace')
      expect(result.config.logLevel).toBe('debug')
    })

    it('should handle invalid JSON gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue('{ invalid json }')

      const loader = new ConfigLoader()
      const result = loader.loadFromFile('/test/.tnmsc.json')

      expect(result.found).toBe(false)
      expect(result.config).toEqual({})
    })

    it('should validate string fields', () => {
      // workspaceDir is invalid (number instead of string)
      const configContent = JSON.stringify({
        workspaceDir: 123,
        shadowSourceProjectDir: '~/shadow',
      })

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(configContent)

      const loader = new ConfigLoader()
      const result = loader.loadFromFile('/test/.tnmsc.json')

      expect(result.found).toBe(true)
      // Invalid field should be ignored
      expect(result.config.workspaceDir).toBeUndefined()
      expect(result.config.shadowSourceProjectDir).toBe('~/shadow')
    })

    it('should validate logLevel values', () => {
      // logLevel is invalid
      const configContent = JSON.stringify({
        logLevel: 'invalid',
      })

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(configContent)

      const loader = new ConfigLoader()
      const result = loader.loadFromFile('/test/.tnmsc.json')

      expect(result.found).toBe(true)
      expect(result.config.logLevel).toBeUndefined()
    })

    it('should validate externalProjects array', () => {
      const configContent = JSON.stringify({
        externalProjects: ['/path/a', '/path/b'],
      })

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(configContent)

      const loader = new ConfigLoader()
      const result = loader.loadFromFile('/test/.tnmsc.json')

      expect(result.found).toBe(true)
      expect(result.config.externalProjects).toEqual(['/path/a', '/path/b'])
    })

    it('should validate excludePatterns object', () => {
      const configContent = JSON.stringify({
        excludePatterns: {
          projectA: ['*.log', 'node_modules'],
          projectB: ['dist'],
        },
      })

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(configContent)

      const loader = new ConfigLoader()
      const result = loader.loadFromFile('/test/.tnmsc.json')

      expect(result.found).toBe(true)
      expect(result.config.excludePatterns).toEqual({
        projectA: ['*.log', 'node_modules'],
        projectB: ['dist'],
      })
    })

    it('should validate profile object with arbitrary key-value pairs', () => {
      const configContent = JSON.stringify({
        profile: {
          name: '张三',
          username: 'zhangsan',
          gender: 'male',
          birthday: '1990-01-01',
          customField: 'custom value',
        },
      })

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(configContent)

      const loader = new ConfigLoader()
      const result = loader.loadFromFile('/test/.tnmsc.json')

      expect(result.found).toBe(true)
      expect(result.config.profile).toEqual({
        name: '张三',
        username: 'zhangsan',
        gender: 'male',
        birthday: '1990-01-01',
        customField: 'custom value',
      })
    })

    it('should reject invalid profile (non-object)', () => {
      const configContent = JSON.stringify({
        profile: 'invalid',
      })

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(configContent)

      const loader = new ConfigLoader()
      const result = loader.loadFromFile('/test/.tnmsc.json')

      expect(result.found).toBe(true)
      expect(result.config.profile).toBeUndefined()
    })

    it('should reject invalid profile (array)', () => {
      const configContent = JSON.stringify({
        profile: ['invalid'],
      })

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(configContent)

      const loader = new ConfigLoader()
      const result = loader.loadFromFile('/test/.tnmsc.json')

      expect(result.found).toBe(true)
      expect(result.config.profile).toBeUndefined()
    })

    it('should validate tool object with string values', () => {
      const configContent = JSON.stringify({
        tool: {
          websearch: 'search_web',
          webfetch: 'fetch_url',
          codeSearch: 'search_code',
        },
      })

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(configContent)

      const loader = new ConfigLoader()
      const result = loader.loadFromFile('/test/.tnmsc.json')

      expect(result.found).toBe(true)
      expect(result.config.tool).toEqual({
        websearch: 'search_web',
        webfetch: 'fetch_url',
        codeSearch: 'search_code',
      })
    })

    it('should reject invalid tool (non-object)', () => {
      const configContent = JSON.stringify({
        tool: 'invalid',
      })

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(configContent)

      const loader = new ConfigLoader()
      const result = loader.loadFromFile('/test/.tnmsc.json')

      expect(result.found).toBe(true)
      expect(result.config.tool).toBeUndefined()
    })

    it('should reject tool with non-string values', () => {
      const configContent = JSON.stringify({
        tool: {
          websearch: 'search_web',
          invalidTool: 123,
        },
      })

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(configContent)

      const loader = new ConfigLoader()
      const result = loader.loadFromFile('/test/.tnmsc.json')

      expect(result.found).toBe(true)
      // Invalid tool should be rejected entirely
      expect(result.config.tool).toBeUndefined()
    })
  })

  describe('load', () => {
    it('should return empty config when no files found', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const loader = new ConfigLoader()
      const result = loader.load(mockCwd)

      expect(result.found).toBe(false)
      expect(result.config).toEqual({})
      expect(result.sources).toEqual([])
    })

    it('should merge configs with correct priority', () => {
      const cwdConfig = JSON.stringify({
        workspaceDir: '~/cwd-workspace',
        logLevel: 'debug',
      })

      const globalConfig = JSON.stringify({
        workspaceDir: '~/global-workspace',
        shadowSourceProjectDir: '~/global-shadow',
        logLevel: 'info',
      })

      const cwdPath = path.join(mockCwd, DEFAULT_CONFIG_FILE_NAME)
      const globalPath = path.join(mockHomedir, DEFAULT_GLOBAL_CONFIG_DIR, DEFAULT_CONFIG_FILE_NAME)

      vi.mocked(fs.existsSync).mockImplementation(p => p === cwdPath || p === globalPath)

      vi.mocked(fs.readFileSync).mockImplementation(p => {
        if (p === cwdPath) return cwdConfig
        if (p === globalPath) return globalConfig
        return '{}'
      })

      const loader = new ConfigLoader()
      const result = loader.load(mockCwd)

      expect(result.found).toBe(true)
      // CWD config should override global
      expect(result.config.workspaceDir).toBe('~/cwd-workspace')
      expect(result.config.logLevel).toBe('debug')
      // Global config should fill in missing values
      expect(result.config.shadowSourceProjectDir).toBe('~/global-shadow')
      expect(result.sources).toHaveLength(2)
    })

    it('should merge externalProjects arrays', () => {
      const cwdConfig = JSON.stringify({
        externalProjects: ['/cwd/project'],
      })

      const globalConfig = JSON.stringify({
        externalProjects: ['/global/project'],
      })

      const cwdPath = path.join(mockCwd, DEFAULT_CONFIG_FILE_NAME)
      const globalPath = path.join(mockHomedir, DEFAULT_GLOBAL_CONFIG_DIR, DEFAULT_CONFIG_FILE_NAME)

      vi.mocked(fs.existsSync).mockImplementation(p => p === cwdPath || p === globalPath)

      vi.mocked(fs.readFileSync).mockImplementation(p => {
        if (p === cwdPath) return cwdConfig
        if (p === globalPath) return globalConfig
        return '{}'
      })

      const loader = new ConfigLoader()
      const result = loader.load(mockCwd)

      // Arrays should be concatenated
      expect(result.config.externalProjects).toContain('/cwd/project')
      expect(result.config.externalProjects).toContain('/global/project')
    })

    it('should deep merge excludePatterns', () => {
      const cwdConfig = JSON.stringify({
        excludePatterns: {
          projectA: ['*.log'],
        },
      })

      const globalConfig = JSON.stringify({
        excludePatterns: {
          projectA: ['node_modules'],
          projectB: ['dist'],
        },
      })

      const cwdPath = path.join(mockCwd, DEFAULT_CONFIG_FILE_NAME)
      const globalPath = path.join(mockHomedir, DEFAULT_GLOBAL_CONFIG_DIR, DEFAULT_CONFIG_FILE_NAME)

      vi.mocked(fs.existsSync).mockImplementation(p => p === cwdPath || p === globalPath)

      vi.mocked(fs.readFileSync).mockImplementation(p => {
        if (p === cwdPath) return cwdConfig
        if (p === globalPath) return globalConfig
        return '{}'
      })

      const loader = new ConfigLoader()
      const result = loader.load(mockCwd)

      // Should merge patterns for same project
      expect(result.config.excludePatterns?.['projectA']).toContain('*.log')
      expect(result.config.excludePatterns?.['projectA']).toContain('node_modules')
      expect(result.config.excludePatterns?.['projectB']).toEqual(['dist'])
    })
  })

  describe('loadUserConfig helper', () => {
    it('should use default loader', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false)

      const result = loadUserConfig(mockCwd)

      expect(result.found).toBe(false)
      expect(result.config).toEqual({})
    })
  })
})
