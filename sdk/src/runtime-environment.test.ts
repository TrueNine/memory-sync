import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {
  getRequiredGlobalConfigPath,
  resolveRuntimeEnvironment,
  resolveUserPath
} from './runtime-environment'

describe('runtime environment', () => {
  let tempDir: string | undefined

  afterEach(() => {
    if (tempDir != null) fs.rmSync(tempDir, {recursive: true, force: true})
    tempDir = void 0
  })

  it('uses the native Windows home config path when running on Windows', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-win-runtime-'))
    const windowsHomeDir = path.join(tempDir, 'WindowsHome')
    const configPath = path.join(windowsHomeDir, '.aindex', '.tnmsc.json')

    fs.mkdirSync(path.dirname(configPath), {recursive: true})
    fs.writeFileSync(configPath, '{}\n', 'utf8')

    const runtimeEnvironment = resolveRuntimeEnvironment({
      fs,
      platform: 'win32',
      env: {
        USERPROFILE: windowsHomeDir
      },
      homedir: windowsHomeDir
    })

    expect(runtimeEnvironment.isWsl).toBe(false)
    expect(runtimeEnvironment.selectedGlobalConfigPath).toBeUndefined()
    expect(runtimeEnvironment.effectiveHomeDir).toBe(windowsHomeDir)
    expect(getRequiredGlobalConfigPath({
      fs,
      platform: 'win32',
      env: {
        USERPROFILE: windowsHomeDir
      },
      homedir: windowsHomeDir
    })).toBe(configPath)
    expect(resolveUserPath('~/.codex/config.toml', {
      fs,
      platform: 'win32',
      env: {
        USERPROFILE: windowsHomeDir
      },
      homedir: windowsHomeDir
    })).toBe(path.win32.join(windowsHomeDir, '.codex', 'config.toml'))
  })

  it('selects the host config path that matches the current Windows profile in WSL', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-wsl-runtime-'))
    const usersRoot = path.join(tempDir, 'Users')
    const alphaConfigPath = path.join(usersRoot, 'alpha', '.aindex', '.tnmsc.json')
    const bravoConfigPath = path.join(usersRoot, 'bravo', '.aindex', '.tnmsc.json')

    fs.mkdirSync(path.dirname(alphaConfigPath), {recursive: true})
    fs.mkdirSync(path.dirname(bravoConfigPath), {recursive: true})
    fs.writeFileSync(alphaConfigPath, '{}\n', 'utf8')
    fs.writeFileSync(bravoConfigPath, '{}\n', 'utf8')

    const runtimeEnvironment = resolveRuntimeEnvironment({
      fs,
      platform: 'linux',
      env: {
        WSL_DISTRO_NAME: 'Ubuntu',
        USERPROFILE: path.join(usersRoot, 'bravo')
      },
      homedir: '/home/linux-user',
      windowsUsersRoot: usersRoot
    })

    expect(runtimeEnvironment.isWsl).toBe(true)
    expect(runtimeEnvironment.selectedGlobalConfigPath).toBe(bravoConfigPath)
    expect(runtimeEnvironment.effectiveHomeDir).toBe(path.join(usersRoot, 'bravo').replaceAll('\\', '/'))
    expect(getRequiredGlobalConfigPath({
      fs,
      platform: 'linux',
      env: {
        WSL_DISTRO_NAME: 'Ubuntu',
        USERPROFILE: path.join(usersRoot, 'bravo')
      },
      homedir: '/home/linux-user',
      windowsUsersRoot: usersRoot
    })).toBe(bravoConfigPath)
  })

  it('fails when the discovered config belongs to another Windows profile', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-wsl-runtime-mismatch-'))
    const usersRoot = path.join(tempDir, 'Users')
    const alphaConfigPath = path.join(usersRoot, 'alpha', '.aindex', '.tnmsc.json')

    fs.mkdirSync(path.dirname(alphaConfigPath), {recursive: true})
    fs.writeFileSync(alphaConfigPath, '{}\n', 'utf8')

    expect(() => getRequiredGlobalConfigPath({
      fs,
      platform: 'linux',
      env: {
        WSL_DISTRO_NAME: 'Ubuntu',
        USERPROFILE: path.join(usersRoot, 'bravo')
      },
      homedir: '/home/linux-user',
      windowsUsersRoot: usersRoot
    })).toThrow('current Windows user')
  })

  it('fails when WSL is active but no host config exists', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-wsl-runtime-missing-'))

    expect(() => getRequiredGlobalConfigPath({
      fs,
      platform: 'linux',
      env: {WSL_DISTRO_NAME: 'Ubuntu'},
      homedir: '/home/linux-user',
      windowsUsersRoot: path.join(tempDir, 'Users')
    })).toThrow('WSL host config file not found')
  })

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
