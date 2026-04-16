import {describe, expect, it} from 'vitest'
import {resolveUserPath} from './runtime-environment'

describe('runtime environment', () => {
  it('maps host-home, windows drive, and environment-variable paths for WSL workloads', () => {
    const runtimeEnvironment = {
      platform: 'linux',
      isWsl: true,
      nativeHomeDir: '/home/linux-user',
      effectiveHomeDir: '/mnt/c/Users/alpha',
      globalConfigCandidates: ['/mnt/c/Users/alpha/.aindex/.tnmsc.json'],
      selectedGlobalConfigPath: '/mnt/c/Users/alpha/.aindex/.tnmsc.json',
      wslHostHomeDir: '/mnt/c/Users/alpha',
      windowsUsersRoot: '/mnt/c/Users',
      expandedEnv: {
        HOME: '/mnt/c/Users/alpha',
        USERPROFILE: '/mnt/c/Users/alpha',
        HOMEDRIVE: 'C:',
        HOMEPATH: '\\Users\\alpha'
      }
    } as const

    expect(resolveUserPath('~/workspace\\foo', runtimeEnvironment)).toBe('/mnt/c/Users/alpha/workspace/foo')
    expect(resolveUserPath('C:\\Work\\Repo', runtimeEnvironment)).toBe('/mnt/c/Work/Repo')
    expect(resolveUserPath('%USERPROFILE%\\workspace\\bar', runtimeEnvironment)).toBe('/mnt/c/Users/alpha/workspace/bar')
    expect(resolveUserPath('$HOME/workspace/baz', runtimeEnvironment)).toBe('/mnt/c/Users/alpha/workspace/baz')
  })
})
