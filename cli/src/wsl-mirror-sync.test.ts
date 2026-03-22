import type {ILogger, OutputPlugin, OutputWriteContext} from './plugins/plugin-core'
import {Buffer} from 'node:buffer'
import * as path from 'node:path'
import {describe, expect, it, vi} from 'vitest'
import {PluginKind} from './plugins/plugin-core'
import {syncWindowsConfigIntoWsl} from './wsl-mirror-sync'

class MemoryMirrorFs {
  readonly files = new Map<string, Buffer>()

  readonly directories = new Set<string>()

  existsSync(targetPath: string): boolean {
    const normalizedPath = path.win32.normalize(targetPath)
    return this.files.has(normalizedPath) || this.directories.has(normalizedPath)
  }

  mkdirSync(targetPath: string, options?: {recursive?: boolean}): void {
    const normalizedPath = path.win32.normalize(targetPath)

    if (options?.recursive === true) {
      let currentPath = normalizedPath
      while (currentPath.length > 0 && !this.directories.has(currentPath)) {
        this.directories.add(currentPath)
        const parentPath = path.win32.dirname(currentPath)
        if (parentPath === currentPath) break
        currentPath = parentPath
      }
      return
    }

    this.directories.add(normalizedPath)
  }

  readFileSync(targetPath: string): Buffer {
    const normalizedPath = path.win32.normalize(targetPath)
    const content = this.files.get(normalizedPath)
    if (content == null) throw new Error(`ENOENT: ${normalizedPath}`)
    return Buffer.from(content)
  }

  writeFileSync(targetPath: string, data: string | NodeJS.ArrayBufferView): void {
    const normalizedPath = path.win32.normalize(targetPath)
    this.directories.add(path.win32.dirname(normalizedPath))
    this.files.set(normalizedPath, Buffer.isBuffer(data) ? Buffer.from(data) : Buffer.from(data.buffer))
  }

  seedDirectory(targetPath: string): void {
    this.directories.add(path.win32.normalize(targetPath))
  }

  seedFile(targetPath: string, content: string): void {
    const normalizedPath = path.win32.normalize(targetPath)
    this.directories.add(path.win32.dirname(normalizedPath))
    this.files.set(normalizedPath, Buffer.from(content, 'utf8'))
  }
}

interface RecordedLogger extends ILogger {
  readonly infoMessages: string[]
}

function createLogger(): RecordedLogger {
  const infoMessages: string[] = []
  return {
    trace: () => {},
    debug: () => {},
    info: (message: unknown) => {
      infoMessages.push(String(message))
    },
    warn: () => {},
    error: () => {},
    fatal: () => {},
    infoMessages
  } as RecordedLogger
}

function createMirrorPlugin(sourcePath: string): OutputPlugin {
  return {
    type: PluginKind.Output,
    name: 'MirrorPlugin',
    log: createLogger(),
    declarativeOutput: true,
    outputCapabilities: {},
    async declareOutputFiles() {
      return []
    },
    async convertContent() {
      return ''
    },
    async declareWslMirrorFiles() {
      return [{sourcePath}]
    }
  }
}

function createWriteContext(instances?: string | string[], dryRun: boolean = false): OutputWriteContext {
  return {
    logger: createLogger(),
    dryRun,
    runtimeTargets: {
      jetbrainsCodexDirs: []
    },
    pluginOptions: {
      windows: {
        wsl2: {
          instances
        }
      }
    },
    collectedOutputContext: {
      workspace: {
        directory: {
          pathKind: 'absolute',
          path: 'C:\\workspace',
          getDirectoryName: () => 'workspace'
        },
        projects: []
      }
    }
  } as unknown as OutputWriteContext
}

describe('wsl mirror sync', () => {
  it('copies declared host config files into each resolved WSL home', async () => {
    const memoryFs = new MemoryMirrorFs()
    const hostHomeDir = 'C:\\Users\\alpha'
    const sourcePath = path.win32.join(hostHomeDir, '.codex', 'config.toml')
    const targetHomeDir = '\\\\wsl$\\Ubuntu\\home\\alpha'
    const targetPath = path.win32.join(targetHomeDir, '.codex', 'config.toml')

    memoryFs.seedFile(sourcePath, 'codex = true\n')
    memoryFs.seedDirectory(targetHomeDir)

    const spawnSyncMock = vi.fn(() => ({
      status: 0,
      stdout: '/home/alpha',
      stderr: ''
    }))

    const result = await syncWindowsConfigIntoWsl(
      [createMirrorPlugin('~/.codex/config.toml')],
      createWriteContext('Ubuntu'),
      {
        fs: memoryFs,
        spawnSync: spawnSyncMock as never,
        platform: 'win32',
        effectiveHomeDir: hostHomeDir
      }
    )

    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.mirroredFiles).toBe(1)
    expect(memoryFs.readFileSync(targetPath).toString('utf8')).toBe('codex = true\n')
  })

  it('warns and skips when a declared host config file does not exist', async () => {
    const memoryFs = new MemoryMirrorFs()
    memoryFs.seedDirectory('\\\\wsl$\\Ubuntu\\home\\alpha')

    const result = await syncWindowsConfigIntoWsl(
      [createMirrorPlugin('~/.claude/settings.json')],
      createWriteContext('Ubuntu'),
      {
        fs: memoryFs,
        spawnSync: vi.fn(() => ({
          status: 0,
          stdout: '/home/alpha',
          stderr: ''
        })) as never,
        platform: 'win32',
        effectiveHomeDir: 'C:\\Users\\alpha'
      }
    )

    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([
      'Skipping missing WSL mirror source file: C:\\Users\\alpha\\.claude\\settings.json'
    ])
    expect(result.mirroredFiles).toBe(0)
  })

  it('validates WSL instance probing before writing any mirrored files', async () => {
    const memoryFs = new MemoryMirrorFs()
    const hostHomeDir = 'C:\\Users\\alpha'
    memoryFs.seedFile(path.win32.join(hostHomeDir, '.codex', 'auth.json'), '{"ok":true}\n')

    const result = await syncWindowsConfigIntoWsl(
      [createMirrorPlugin('~/.codex/auth.json')],
      createWriteContext('BrokenUbuntu'),
      {
        fs: memoryFs,
        spawnSync: vi.fn(() => ({
          status: 1,
          stdout: '',
          stderr: 'distribution not found'
        })) as never,
        platform: 'win32',
        effectiveHomeDir: hostHomeDir
      }
    )

    expect(result.mirroredFiles).toBe(0)
    expect(result.warnings).toEqual([])
    expect(result.errors).toEqual([
      'Failed to probe WSL instance "BrokenUbuntu". distribution not found'
    ])
  })

  it('counts dry-run mirror operations without writing files', async () => {
    const memoryFs = new MemoryMirrorFs()
    const hostHomeDir = 'C:\\Users\\alpha'
    const sourcePath = path.win32.join(hostHomeDir, '.claude', 'config.json')
    const targetHomeDir = '\\\\wsl$\\Ubuntu\\home\\alpha'
    const targetPath = path.win32.join(targetHomeDir, '.claude', 'config.json')

    memoryFs.seedFile(sourcePath, '{"theme":"dark"}\n')
    memoryFs.seedDirectory(targetHomeDir)

    const result = await syncWindowsConfigIntoWsl(
      [createMirrorPlugin('~/.claude/config.json')],
      createWriteContext('Ubuntu', true),
      {
        fs: memoryFs,
        spawnSync: vi.fn(() => ({
          status: 0,
          stdout: '/home/alpha',
          stderr: ''
        })) as never,
        platform: 'win32',
        effectiveHomeDir: hostHomeDir
      }
    )

    expect(result.errors).toEqual([])
    expect(result.mirroredFiles).toBe(1)
    expect(memoryFs.existsSync(targetPath)).toBe(false)
  })

  it('logs info and skips mirror sync when WSL is unavailable on the host', async () => {
    const memoryFs = new MemoryMirrorFs()
    const logger = createLogger()

    const result = await syncWindowsConfigIntoWsl(
      [createMirrorPlugin('~/.codex/config.toml')],
      {
        ...createWriteContext('Ubuntu'),
        logger
      },
      {
        fs: memoryFs,
        spawnSync: vi.fn(() => ({
          status: null,
          stdout: '',
          stderr: '',
          error: Object.assign(new Error('spawnSync wsl.exe ENOENT'), {code: 'ENOENT'})
        })) as never,
        platform: 'win32',
        effectiveHomeDir: 'C:\\Users\\alpha'
      }
    )

    expect(result).toEqual({
      mirroredFiles: 0,
      warnings: [],
      errors: []
    })
    expect(logger.infoMessages).toContain('wsl is unavailable, skipping WSL mirror sync')
  })
})
