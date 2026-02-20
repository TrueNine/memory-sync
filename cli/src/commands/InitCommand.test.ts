import type {CommandContext, CommandResult} from './Command'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {DEFAULT_CONFIG_FILE_NAME, DEFAULT_GLOBAL_CONFIG_DIR} from '@/ConfigLoader'
import {InitCommand} from './InitCommand'

vi.mock('node:fs')
vi.mock('node:os')
vi.mock('@truenine/desk-paths', () => ({
  isSymlink: vi.fn(() => false),
  readSymlinkTarget: vi.fn(() => null),
  deletePathSync: vi.fn()
}))
vi.mock('@/ShadowSourceProject', () => ({
  generateShadowSourceProject: vi.fn(() => ({
    success: true,
    rootPath: '/workspace/tnmsc-shadow',
    createdDirs: [],
    createdFiles: [],
    existedDirs: ['/workspace/tnmsc-shadow'],
    existedFiles: []
  }))
}))

const MOCK_HOME = '/home/testuser'
const MOCK_CWD = '/workspace/myproject'
const GLOBAL_CONFIG_PATH = path.join(MOCK_HOME, DEFAULT_GLOBAL_CONFIG_DIR, DEFAULT_CONFIG_FILE_NAME)
const CWD_CONFIG_PATH = path.join(MOCK_CWD, DEFAULT_CONFIG_FILE_NAME)

function makeCtx(overrides: Partial<CommandContext> = {}): CommandContext {
  const logger = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
  return {
    logger,
    outputPlugins: [],
    collectedInputContext: {} as CommandContext['collectedInputContext'],
    userConfigOptions: {
      version: '2026.1',
      workspaceDir: '/workspace',
      shadowSourceProject: {
        name: 'tnmsc-shadow',
        skill: {src: 'src/skills', dist: 'dist/skills'},
        fastCommand: {src: 'src/commands', dist: 'dist/commands'},
        subAgent: {src: 'src/agents', dist: 'dist/agents'},
        rule: {src: 'src/rules', dist: 'dist/rules'},
        globalMemory: {src: 'app/global.cn.mdx', dist: 'dist/global.mdx'},
        workspaceMemory: {src: 'app/workspace.cn.mdx', dist: 'dist/app/workspace.mdx'},
        project: {src: 'app', dist: 'dist/app'}
      },
      logLevel: 'info',
      fastCommandSeriesOptions: {},
      plugins: []
    },
    createCleanContext: vi.fn(),
    createWriteContext: vi.fn(),
    ...overrides
  } as unknown as CommandContext
}

describe('initCommand', () => {
  beforeEach(() => {
    vi.mocked(os.homedir).mockReturnValue(MOCK_HOME)
    vi.spyOn(process, 'cwd').mockReturnValue(MOCK_CWD)
    vi.mocked(fs.existsSync).mockReturnValue(false)
    vi.mocked(fs.symlinkSync).mockImplementation(() => void 0)
    vi.mocked(fs.copyFileSync).mockImplementation(() => void 0)
  })

  afterEach(() => vi.clearAllMocks())

  it('has name "init"', () => expect(new InitCommand().name).toBe('init'))

  describe('execute — result shape', () => {
    it('returns success=true when shadow project already exists', async () => {
      const result: CommandResult = await new InitCommand().execute(makeCtx())
      expect(result.success).toBe(true)
    })

    it('returns numeric filesAffected and dirsAffected', async () => {
      const result = await new InitCommand().execute(makeCtx())
      expect(typeof result.filesAffected).toBe('number')
      expect(typeof result.dirsAffected).toBe('number')
    })

    it('returns a non-empty message string', async () => {
      const result = await new InitCommand().execute(makeCtx())
      expect(typeof result.message).toBe('string')
      expect(result.message!.length).toBeGreaterThan(0)
    })
  })

  describe('linkCwdConfig — symlink happy path', () => {
    it('creates a symlink at cwd/.tnmsc.json pointing to global config', async () => {
      vi.mocked(fs.existsSync).mockImplementation(p => p === GLOBAL_CONFIG_PATH)

      await new InitCommand().execute(makeCtx())

      expect(fs.symlinkSync).toHaveBeenCalledWith(GLOBAL_CONFIG_PATH, CWD_CONFIG_PATH, 'file')
    })

    it('logs debug after successful symlink creation', async () => {
      vi.mocked(fs.existsSync).mockImplementation(p => p === GLOBAL_CONFIG_PATH)
      const ctx = makeCtx()

      await new InitCommand().execute(ctx)

      expect(ctx.logger.debug).toHaveBeenCalledWith(
        'linked config',
        expect.objectContaining({link: CWD_CONFIG_PATH, target: GLOBAL_CONFIG_PATH})
      )
    })
  })

  describe('linkCwdConfig — symlink fallback to copy', () => {
    it('falls back to copyFileSync when symlinkSync throws', async () => {
      vi.mocked(fs.existsSync).mockImplementation(p => p === GLOBAL_CONFIG_PATH)
      vi.mocked(fs.symlinkSync).mockImplementation(() => {
        throw new Error('EPERM: operation not permitted')
      })

      await new InitCommand().execute(makeCtx())

      expect(fs.copyFileSync).toHaveBeenCalledWith(GLOBAL_CONFIG_PATH, CWD_CONFIG_PATH)
    })

    it('logs warn when falling back to copy', async () => {
      vi.mocked(fs.existsSync).mockImplementation(p => p === GLOBAL_CONFIG_PATH)
      vi.mocked(fs.symlinkSync).mockImplementation(() => {
        throw new Error('EPERM: operation not permitted')
      })
      const ctx = makeCtx()

      await new InitCommand().execute(ctx)

      expect(ctx.logger.warn).toHaveBeenCalledWith(
        'symlink unavailable, copied config (auto-sync disabled)',
        expect.objectContaining({dest: CWD_CONFIG_PATH})
      )
    })

    it('logs warn when both symlink and copy fail', async () => {
      vi.mocked(fs.existsSync).mockImplementation(p => p === GLOBAL_CONFIG_PATH)
      vi.mocked(fs.symlinkSync).mockImplementation(() => {
        throw new Error('EPERM: operation not permitted')
      })
      vi.mocked(fs.copyFileSync).mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory')
      })
      const ctx = makeCtx()

      await new InitCommand().execute(ctx)

      expect(ctx.logger.warn).toHaveBeenCalledWith(
        'failed to link or copy config',
        expect.objectContaining({path: CWD_CONFIG_PATH, error: 'ENOENT: no such file or directory'})
      )
    })

    it('does not throw when both symlink and copy fail', async () => {
      vi.mocked(fs.existsSync).mockImplementation(p => p === GLOBAL_CONFIG_PATH)
      vi.mocked(fs.symlinkSync).mockImplementation(() => {
        throw new Error('EPERM')
      })
      vi.mocked(fs.copyFileSync).mockImplementation(() => {
        throw new Error('ENOENT')
      })

      await expect(new InitCommand().execute(makeCtx())).resolves.not.toThrow()
    })
  })

  describe('linkCwdConfig — path construction', () => {
    it('uses process.cwd() for cwd config path', async () => {
      const customCwd = '/custom/project/dir'
      vi.spyOn(process, 'cwd').mockReturnValue(customCwd)
      const expectedCwdConfig = path.join(customCwd, DEFAULT_CONFIG_FILE_NAME)
      vi.mocked(fs.existsSync).mockImplementation(p => p === GLOBAL_CONFIG_PATH)

      await new InitCommand().execute(makeCtx())

      expect(fs.symlinkSync).toHaveBeenCalledWith(
        expect.any(String),
        expectedCwdConfig,
        'file'
      )
    })

    it('uses os.homedir() for global config path', async () => {
      const customHome = '/custom/home'
      vi.mocked(os.homedir).mockReturnValue(customHome)
      const expectedGlobal = path.join(customHome, DEFAULT_GLOBAL_CONFIG_DIR, DEFAULT_CONFIG_FILE_NAME)
      vi.mocked(fs.existsSync).mockImplementation(p => p === expectedGlobal)

      await new InitCommand().execute(makeCtx())

      expect(fs.symlinkSync).toHaveBeenCalledWith(
        expectedGlobal,
        expect.any(String),
        'file'
      )
    })
  })
})
