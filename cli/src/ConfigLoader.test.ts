import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {createLogger} from './plugins/plugin-core'

const mockedGuardModule = vi.hoisted(() => ({
  protectedViolation: {
    targetPath: '',
    protectedPath: '',
    protection: 'exact' as const,
    reason: 'test'
  },
  getProtectedPathViolationMock: vi.fn(),
  logProtectedDeletionGuardErrorMock: vi.fn()
}))

mockedGuardModule.getProtectedPathViolationMock.mockImplementation(() => mockedGuardModule.protectedViolation)

vi.mock('./ProtectedDeletionGuard', async () => {
  const actual = await vi.importActual<typeof import('./ProtectedDeletionGuard')>('./ProtectedDeletionGuard')
  return {
    ...actual,
    getProtectedPathViolation: mockedGuardModule.getProtectedPathViolationMock,
    logProtectedDeletionGuardError: mockedGuardModule.logProtectedDeletionGuardErrorMock
  }
})

describe('ensureConfigLink', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockedGuardModule.getProtectedPathViolationMock.mockImplementation(() => mockedGuardModule.protectedViolation)
  })

  it('blocks deleting a protected config path during link replacement', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-config-link-guard-'))
    const localConfigPath = path.join(tempDir, '.tnmsc.json')
    const globalConfigPath = path.join(tempDir, 'global-target.json')
    const {ensureConfigLink} = await import('./ConfigLoader')

    try {
      fs.writeFileSync(localConfigPath, '{"logLevel":"info"}', 'utf8')
      fs.writeFileSync(globalConfigPath, '{"logLevel":"warn"}', 'utf8')

      expect(() => ensureConfigLink(localConfigPath, globalConfigPath, createLogger('ensureConfigLinkTest', 'silent')))
        .toThrow('Protected deletion guard blocked config-link-replacement')
      expect(fs.readFileSync(localConfigPath, 'utf8')).toBe('{"logLevel":"info"}')
      expect(mockedGuardModule.logProtectedDeletionGuardErrorMock).toHaveBeenCalledOnce()
    }
    finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })
})
