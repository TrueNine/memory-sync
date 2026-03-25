import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {deleteFiles, deleteTargets, getPlatformFixedDir} from '../core/desk-paths'

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
    vi.restoreAllMocks()
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

  it('deletes mixed file and directory targets in one batch', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-desk-paths-delete-targets-'))
    const outputFile = path.join(tempDir, 'output.txt')
    const outputDir = path.join(tempDir, 'nested')
    const nestedFile = path.join(outputDir, 'artifact.txt')

    try {
      fs.mkdirSync(outputDir, {recursive: true})
      fs.writeFileSync(outputFile, 'file', 'utf8')
      fs.writeFileSync(nestedFile, 'nested', 'utf8')

      const result = await deleteTargets({
        files: [outputFile],
        dirs: [outputDir]
      })

      expect(result.deletedFiles).toEqual([outputFile])
      expect(result.deletedDirs).toEqual([outputDir])
      expect(result.fileErrors).toEqual([])
      expect(result.dirErrors).toEqual([])
      expect(fs.existsSync(outputFile)).toBe(false)
      expect(fs.existsSync(outputDir)).toBe(false)
    }
    finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })

  it('caps delete file concurrency to the configured worker limit', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-desk-paths-concurrency-'))
    const files = Array.from({length: 40}, (_, index) => path.join(tempDir, `artifact-${index}.txt`))
    let active = 0
    let maxActive = 0
    const originalLstat = fs.promises.lstat.bind(fs.promises)

    try {
      fs.mkdirSync(tempDir, {recursive: true})
      for (const filePath of files) fs.writeFileSync(filePath, 'artifact', 'utf8')

      vi.spyOn(fs.promises, 'lstat').mockImplementation(async filePath => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise(resolve => setTimeout(resolve, 20))

        try {
          return await originalLstat(filePath)
        }
        finally {
          active -= 1
        }
      })

      const result = await deleteFiles(files)

      expect(result.deleted).toBe(files.length)
      expect(result.errors).toEqual([])
      expect(maxActive).toBeLessThanOrEqual(32)
      expect(maxActive).toBeGreaterThan(1)
    }
    finally {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })
})
