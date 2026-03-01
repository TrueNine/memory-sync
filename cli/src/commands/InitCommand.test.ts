import type {CommandContext, CommandResult} from './Command'
import * as os from 'node:os'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {InitCommand} from './InitCommand'

vi.mock('node:os')
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
  beforeEach(() => vi.mocked(os.homedir).mockReturnValue(MOCK_HOME))

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
})
