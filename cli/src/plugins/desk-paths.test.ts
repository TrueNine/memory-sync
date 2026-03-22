import * as path from 'node:path'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {getPlatformFixedDir} from './desk-paths'

const {resolveRuntimeEnvironmentMock, resolveUserPathMock} = vi.hoisted(() => ({
  resolveRuntimeEnvironmentMock: vi.fn(),
  resolveUserPathMock: vi.fn((value: string) => value)
}))

vi.mock('@/runtime-environment', async importActual => {
  const actual = await importActual<typeof import('@/runtime-environment')>()
  return {
    ...actual,
    resolveRuntimeEnvironment: resolveRuntimeEnvironmentMock,
    resolveUserPath: resolveUserPathMock
  }
})

const originalXdgDataHome = process.env['XDG_DATA_HOME']
const originalLocalAppData = process.env['LOCALAPPDATA']

describe('desk paths', () => {
  afterEach(() => {
    vi.clearAllMocks()

    if (originalXdgDataHome == null) delete process.env['XDG_DATA_HOME']
    else process.env['XDG_DATA_HOME'] = originalXdgDataHome
    if (originalLocalAppData == null) delete process.env['LOCALAPPDATA']
    else process.env['LOCALAPPDATA'] = originalLocalAppData
  })

  it('uses linux data paths outside WSL', () => {
    delete process.env['XDG_DATA_HOME']
    resolveRuntimeEnvironmentMock.mockReturnValue({
      platform: 'linux',
      isWsl: false,
      nativeHomeDir: '/home/alpha',
      effectiveHomeDir: '/home/alpha',
      globalConfigCandidates: [],
      windowsUsersRoot: '/mnt/c/Users',
      expandedEnv: {}
    })

    expect(getPlatformFixedDir().replaceAll('\\', '/')).toBe(path.join('/home/alpha', '.local', 'share').replaceAll('\\', '/'))
  })

  it('uses Windows fixed-dir semantics when WSL targets the host home', () => {
    process.env['LOCALAPPDATA'] = 'C:\\Users\\alpha\\AppData\\Local'
    resolveRuntimeEnvironmentMock.mockReturnValue({
      platform: 'linux',
      isWsl: true,
      nativeHomeDir: '/home/alpha',
      effectiveHomeDir: '/mnt/c/Users/alpha',
      globalConfigCandidates: ['/mnt/c/Users/alpha/.aindex/.tnmsc.json'],
      selectedGlobalConfigPath: '/mnt/c/Users/alpha/.aindex/.tnmsc.json',
      wslHostHomeDir: '/mnt/c/Users/alpha',
      windowsUsersRoot: '/mnt/c/Users',
      expandedEnv: {}
    })
    resolveUserPathMock.mockReturnValue('/mnt/c/Users/alpha/AppData/Local')

    expect(getPlatformFixedDir()).toBe('/mnt/c/Users/alpha/AppData/Local')
    expect(resolveUserPathMock).toHaveBeenCalledWith('C:\\Users\\alpha\\AppData\\Local')
  })
})
