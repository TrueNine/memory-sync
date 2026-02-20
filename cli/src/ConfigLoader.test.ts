import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {ConfigLoader, DEFAULT_CONFIG_FILE_NAME, DEFAULT_GLOBAL_CONFIG_DIR, ensureConfigLink, loadUserConfig} from './ConfigLoader'

vi.mock('node:fs') // Mock fs module
vi.mock('node:os')
vi.mock('@truenine/desk-paths', () => ({
  isSymlink: vi.fn(),
  readSymlinkTarget: vi.fn(),
  deletePathSync: vi.fn()
}))

describe('configLoader', () => {
  const mockHomedir = '/home/testuser'
  const mockCwd = '/workspace/project'

  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue(mockHomedir)
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.readFileSync).mockReturnValue('{}')
  })

  afterEach(() => vi.clearAllMocks())

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
      const configContent = JSON.stringify({workspaceDir: '~/myworkspace', logLevel: 'debug'})

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
      const configContent = JSON.stringify({ // workspaceDir is invalid (number instead of string)
        workspaceDir: 123
      })

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(configContent)

      const loader = new ConfigLoader()
      const result = loader.loadFromFile('/test/.tnmsc.json')

      expect(result.found).toBe(true)
      expect(result.config.workspaceDir).toBeUndefined() // Invalid field should be ignored
    })

    it('should validate logLevel values', () => {
      const configContent = JSON.stringify({ // logLevel is invalid
        logLevel: 'invalid'
      })

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(configContent)

      const loader = new ConfigLoader()
      const result = loader.loadFromFile('/test/.tnmsc.json')

      expect(result.found).toBe(true)
      expect(result.config.logLevel).toBeUndefined()
    })

    it('should validate shadowSourceProject object', () => {
      const configContent = JSON.stringify({
        shadowSourceProject: {
          name: 'aindex',
          skill: {src: 'src/skills', dist: 'dist/skills'},
          fastCommand: {src: 'src/commands', dist: 'dist/commands'},
          subAgent: {src: 'src/agents', dist: 'dist/agents'},
          rule: {src: 'src/rules', dist: 'dist/rules'},
          globalMemory: {src: 'app/global.cn.mdx', dist: 'dist/global.mdx'},
          workspaceMemory: {src: 'app/workspace.cn.mdx', dist: 'dist/app/workspace.mdx'},
          project: {src: 'app', dist: 'dist/app'}
        }
      })

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(configContent)

      const loader = new ConfigLoader()
      const result = loader.loadFromFile('/test/.tnmsc.json')

      expect(result.found).toBe(true)
      expect(result.config.shadowSourceProject?.name).toBe('aindex')
      expect(result.config.shadowSourceProject?.skill).toEqual({src: 'src/skills', dist: 'dist/skills'})
    })

    it('should reject invalid shadowSourceProject (non-object)', () => {
      const configContent = JSON.stringify({shadowSourceProject: 'invalid'})

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(configContent)

      const loader = new ConfigLoader()
      const result = loader.loadFromFile('/test/.tnmsc.json')

      expect(result.found).toBe(true)
      expect(result.config.shadowSourceProject).toBeUndefined()
    })

    it('should validate profile object with arbitrary key-value pairs', () => {
      const configContent = JSON.stringify({
        profile: {
          name: 'Zhang San',
          username: 'zhangsan',
          gender: 'male',
          birthday: '1990-01-01',
          customField: 'custom value'
        }
      })

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(configContent)

      const loader = new ConfigLoader()
      const result = loader.loadFromFile('/test/.tnmsc.json')

      expect(result.found).toBe(true)
      expect(result.config.profile).toEqual({
        name: 'Zhang San',
        username: 'zhangsan',
        gender: 'male',
        birthday: '1990-01-01',
        customField: 'custom value'
      })
    })

    it('should reject invalid profile (non-object)', () => {
      const configContent = JSON.stringify({profile: 'invalid'})

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(configContent)

      const loader = new ConfigLoader()
      const result = loader.loadFromFile('/test/.tnmsc.json')

      expect(result.found).toBe(true)
      expect(result.config.profile).toBeUndefined()
    })

    it('should reject invalid profile (array)', () => {
      const configContent = JSON.stringify({
        profile: ['invalid']
      })

      vi.mocked(fs.existsSync).mockReturnValue(true)
      vi.mocked(fs.readFileSync).mockReturnValue(configContent)

      const loader = new ConfigLoader()
      const result = loader.loadFromFile('/test/.tnmsc.json')

      expect(result.found).toBe(true)
      expect(result.config.profile).toBeUndefined()
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
      const cwdConfig = JSON.stringify({workspaceDir: '~/cwd-workspace', logLevel: 'debug'})

      const globalConfig = JSON.stringify({
        workspaceDir: '~/global-workspace',
        shadowSourceProject: {
          name: 'global-shadow',
          skill: {src: 'src/skills', dist: 'dist/skills'},
          fastCommand: {src: 'src/commands', dist: 'dist/commands'},
          subAgent: {src: 'src/agents', dist: 'dist/agents'},
          rule: {src: 'src/rules', dist: 'dist/rules'},
          globalMemory: {src: 'app/global.cn.mdx', dist: 'dist/global.mdx'},
          workspaceMemory: {src: 'app/workspace.cn.mdx', dist: 'dist/app/workspace.mdx'},
          project: {src: 'app', dist: 'dist/app'}
        },
        logLevel: 'info'
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
      expect(result.config.workspaceDir).toBe('~/cwd-workspace') // CWD config should override global
      expect(result.config.logLevel).toBe('debug')
      expect(result.config.shadowSourceProject?.name).toBe('global-shadow') // Global config should fill in missing values
      expect(result.sources).toHaveLength(2)
    })

    it('should deep merge shadowSourceProject', () => {
      const cwdConfig = JSON.stringify({
        shadowSourceProject: {
          name: 'cwd-shadow',
          skill: {src: 'custom/skills', dist: 'custom/dist/skills'},
          fastCommand: {src: 'src/commands', dist: 'dist/commands'},
          subAgent: {src: 'src/agents', dist: 'dist/agents'},
          rule: {src: 'src/rules', dist: 'dist/rules'},
          globalMemory: {src: 'app/global.cn.mdx', dist: 'dist/global.mdx'},
          workspaceMemory: {src: 'app/workspace.cn.mdx', dist: 'dist/app/workspace.mdx'},
          project: {src: 'app', dist: 'dist/app'}
        }
      })

      const globalConfig = JSON.stringify({
        shadowSourceProject: {
          name: 'global-shadow',
          skill: {src: 'src/skills', dist: 'dist/skills'},
          fastCommand: {src: 'src/commands', dist: 'dist/commands'},
          subAgent: {src: 'src/agents', dist: 'dist/agents'},
          rule: {src: 'src/rules', dist: 'dist/rules'},
          globalMemory: {src: 'app/global.cn.mdx', dist: 'dist/global.mdx'},
          workspaceMemory: {src: 'app/workspace.cn.mdx', dist: 'dist/app/workspace.mdx'},
          project: {src: 'app', dist: 'dist/app'}
        }
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

      expect(result.config.shadowSourceProject?.name).toBe('cwd-shadow') // CWD name overrides global
      expect(result.config.shadowSourceProject?.skill?.src).toBe('custom/skills') // CWD pair overrides global
      expect(result.config.shadowSourceProject?.fastCommand?.src).toBe('src/commands') // Global fills in missing pairs
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

describe('ensureConfigLink', () => {
  let deskPaths: typeof import('@truenine/desk-paths')

  const LOCAL = '/shadow/.tnmsc.json'
  const GLOBAL = '/home/testuser/.aindex/.tnmsc.json'

  const logger = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn()
  }

  beforeEach(async () => {
    deskPaths = await import('@truenine/desk-paths')
    vi.mocked(os.homedir).mockReturnValue('/home/testuser')
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.symlinkSync).mockImplementation(() => void 0)
    vi.mocked(fs.copyFileSync).mockImplementation(() => void 0)
    vi.mocked(deskPaths.isSymlink).mockReturnValue(false)
    vi.mocked(deskPaths.readSymlinkTarget).mockReturnValue(null)
    vi.mocked(deskPaths.deletePathSync).mockImplementation(() => void 0)
  })

  afterEach(() => vi.clearAllMocks())

  it('no-op when global config does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false)

    ensureConfigLink(LOCAL, GLOBAL, logger)

    expect(fs.symlinkSync).not.toHaveBeenCalled()
    expect(fs.copyFileSync).not.toHaveBeenCalled()
  })

  it('creates symlink when local file does not exist', () => {
    vi.mocked(fs.existsSync).mockImplementation(p => p === GLOBAL)
    vi.mocked(deskPaths.isSymlink).mockReturnValue(false)

    ensureConfigLink(LOCAL, GLOBAL, logger)

    expect(fs.symlinkSync).toHaveBeenCalledWith(GLOBAL, LOCAL, 'file')
  })

  it('no-op when local is a correct symlink pointing to global', () => {
    vi.mocked(fs.existsSync).mockImplementation(p => p === GLOBAL || p === LOCAL)
    vi.mocked(deskPaths.isSymlink).mockReturnValue(true)
    vi.mocked(deskPaths.readSymlinkTarget).mockReturnValue(GLOBAL)

    ensureConfigLink(LOCAL, GLOBAL, logger)

    expect(fs.symlinkSync).not.toHaveBeenCalled()
    expect(deskPaths.deletePathSync).not.toHaveBeenCalled()
  })

  it('deletes stale symlink and recreates when target differs', () => {
    vi.mocked(fs.existsSync).mockImplementation(p => p === GLOBAL || p === LOCAL)
    vi.mocked(deskPaths.isSymlink).mockReturnValue(true)
    vi.mocked(deskPaths.readSymlinkTarget).mockReturnValue('/other/path/.tnmsc.json')

    ensureConfigLink(LOCAL, GLOBAL, logger)

    expect(deskPaths.deletePathSync).toHaveBeenCalledWith(LOCAL)
    expect(fs.symlinkSync).toHaveBeenCalledWith(GLOBAL, LOCAL, 'file')
  })

  it('syncs regular file back to global when local is newer, then recreates symlink', () => {
    vi.mocked(fs.existsSync).mockImplementation(p => p === GLOBAL || p === LOCAL)
    vi.mocked(deskPaths.isSymlink).mockReturnValue(false)
    vi.mocked(fs.statSync).mockImplementation(p => {
      if (p === LOCAL) return {mtimeMs: 2000} as fs.Stats
      return {mtimeMs: 1000} as fs.Stats
    })

    ensureConfigLink(LOCAL, GLOBAL, logger)

    expect(fs.copyFileSync).toHaveBeenCalledWith(LOCAL, GLOBAL)
    expect(deskPaths.deletePathSync).toHaveBeenCalledWith(LOCAL)
    expect(fs.symlinkSync).toHaveBeenCalledWith(GLOBAL, LOCAL, 'file')
  })

  it('deletes regular file without sync-back when local is older than global', () => {
    vi.mocked(fs.existsSync).mockImplementation(p => p === GLOBAL || p === LOCAL)
    vi.mocked(deskPaths.isSymlink).mockReturnValue(false)
    vi.mocked(fs.statSync).mockImplementation(p => {
      if (p === LOCAL) return {mtimeMs: 500} as fs.Stats
      return {mtimeMs: 1000} as fs.Stats
    })

    ensureConfigLink(LOCAL, GLOBAL, logger)

    expect(fs.copyFileSync).not.toHaveBeenCalledWith(LOCAL, GLOBAL)
    expect(deskPaths.deletePathSync).toHaveBeenCalledWith(LOCAL)
    expect(fs.symlinkSync).toHaveBeenCalledWith(GLOBAL, LOCAL, 'file')
  })

  it('falls back to copy when symlink fails', () => {
    vi.mocked(fs.existsSync).mockImplementation(p => p === GLOBAL)
    vi.mocked(deskPaths.isSymlink).mockReturnValue(false)
    vi.mocked(fs.symlinkSync).mockImplementation(() => {
      throw new Error('EPERM: operation not permitted')
    })

    ensureConfigLink(LOCAL, GLOBAL, logger)

    expect(fs.copyFileSync).toHaveBeenCalledWith(GLOBAL, LOCAL)
    expect(logger.warn).toHaveBeenCalledWith(
      'symlink unavailable, copied config (auto-sync disabled)',
      expect.objectContaining({dest: LOCAL})
    )
  })

  it('logs warn and does not throw when both symlink and copy fail', () => {
    vi.mocked(fs.existsSync).mockImplementation(p => p === GLOBAL)
    vi.mocked(deskPaths.isSymlink).mockReturnValue(false)
    vi.mocked(fs.symlinkSync).mockImplementation(() => {
      throw new Error('EPERM')
    })
    vi.mocked(fs.copyFileSync).mockImplementation(() => {
      throw new Error('ENOENT')
    })

    expect(() => ensureConfigLink(LOCAL, GLOBAL, logger)).not.toThrow()
    expect(logger.warn).toHaveBeenCalledWith(
      'failed to link or copy config',
      expect.objectContaining({path: LOCAL, error: 'ENOENT'})
    )
  })
})
