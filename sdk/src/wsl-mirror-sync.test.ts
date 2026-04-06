import type {ILogger, OutputFileDeclaration, OutputPlugin, OutputWriteContext} from './plugins/plugin-core'
import {Buffer} from 'node:buffer'
import * as path from 'node:path'
import {describe, expect, it, vi} from 'vitest'
import {PluginKind} from './plugins/plugin-core'
import {collectDeclaredWslMirrorFiles, syncWindowsConfigIntoWsl} from './wsl-mirror-sync'

class MemoryMirrorFs {
  readonly files = new Map<string, Buffer>()

  readonly directories = new Set<string>()

  private normalizePath(targetPath: string): string {
    if (targetPath.includes('\\') || /^[A-Za-z]:[\\/]/u.test(targetPath)) {
      return path.win32.normalize(targetPath)
    }

    return path.posix.normalize(targetPath)
  }

  private getPathModule(targetPath: string): typeof path.win32 | typeof path.posix {
    if (targetPath.includes('\\') || /^[A-Za-z]:[\\/]/u.test(targetPath)) {
      return path.win32
    }

    return path.posix
  }

  existsSync(targetPath: string): boolean {
    const normalizedPath = this.normalizePath(targetPath)
    return this.files.has(normalizedPath) || this.directories.has(normalizedPath)
  }

  mkdirSync(targetPath: string, options?: {recursive?: boolean}): void {
    const pathModule = this.getPathModule(targetPath)
    const normalizedPath = pathModule.normalize(targetPath)

    if (options?.recursive === true) {
      let currentPath = normalizedPath
      while (currentPath.length > 0 && !this.directories.has(currentPath)) {
        this.directories.add(currentPath)
        const parentPath = pathModule.dirname(currentPath)
        if (parentPath === currentPath) break
        currentPath = parentPath
      }
      return
    }

    this.directories.add(normalizedPath)
  }

  readFileSync(targetPath: string): Buffer {
    const normalizedPath = this.normalizePath(targetPath)
    const content = this.files.get(normalizedPath)
    if (content == null) throw new Error(`ENOENT: ${normalizedPath}`)
    return Buffer.from(content)
  }

  writeFileSync(targetPath: string, data: string | NodeJS.ArrayBufferView): void {
    const pathModule = this.getPathModule(targetPath)
    const normalizedPath = pathModule.normalize(targetPath)
    this.directories.add(pathModule.dirname(normalizedPath))

    if (typeof data === 'string') {
      this.files.set(normalizedPath, Buffer.from(data, 'utf8'))
      return
    }

    this.files.set(normalizedPath, Buffer.from(data.buffer, data.byteOffset, data.byteLength))
  }

  seedDirectory(targetPath: string): void {
    this.directories.add(this.normalizePath(targetPath))
  }

  seedFile(targetPath: string, content: string): void {
    const pathModule = this.getPathModule(targetPath)
    const normalizedPath = pathModule.normalize(targetPath)
    this.directories.add(pathModule.dirname(normalizedPath))
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

function createMirrorPlugin(
  sourcePaths: string | readonly string[] = [],
  pluginName: string = 'MirrorPlugin'
): OutputPlugin {
  const normalizedPaths = Array.isArray(sourcePaths) ? sourcePaths : [sourcePaths]

  return {
    type: PluginKind.Output,
    name: pluginName,
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
      return normalizedPaths
        .filter(sourcePath => sourcePath.length > 0)
        .map(sourcePath => ({sourcePath}))
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

function createPredeclaredOutputs(
  plugin: OutputPlugin,
  declarations: readonly OutputFileDeclaration[]
): ReadonlyMap<OutputPlugin, readonly OutputFileDeclaration[]> {
  return new Map([[plugin, declarations]])
}

function createGlobalOutputDeclaration(
  targetPath: string
): OutputFileDeclaration {
  return {
    path: targetPath,
    scope: 'global',
    source: {kind: 'generated'}
  }
}

function createWslSpawnSyncMock(
  homesByInstance: Readonly<Record<string, string>>,
  discoveredInstances: readonly string[] = Object.keys(homesByInstance)
) {
  return vi.fn((_command: string, args: readonly string[]) => {
    if (args[0] === '--list' && args[1] === '--quiet') {
      return {
        status: 0,
        stdout: Buffer.from(discoveredInstances.join('\r\n'), 'utf16le'),
        stderr: Buffer.alloc(0)
      }
    }

    if (args[0] === '-d') {
      const instance = args[1]
      const linuxHomeDir = instance == null ? void 0 : homesByInstance[instance]

      if (linuxHomeDir == null) {
        return {
          status: 1,
          stdout: Buffer.alloc(0),
          stderr: Buffer.from(`distribution "${instance}" not found`, 'utf8')
        }
      }

      return {
        status: 0,
        stdout: Buffer.from(linuxHomeDir, 'utf8'),
        stderr: Buffer.alloc(0)
      }
    }

    throw new Error(`Unexpected spawnSync args: ${JSON.stringify(args)}`)
  })
}

function wasWslListCalled(
  spawnSyncMock: ReturnType<typeof vi.fn>
): boolean {
  return spawnSyncMock.mock.calls.some(([, args]) => Array.isArray(args) && args[0] === '--list' && args[1] === '--quiet')
}

describe('wsl mirror sync', () => {
  it('skips declared WSL mirror files for opt-in plugins that are not enabled', async () => {
    const declarations = await collectDeclaredWslMirrorFiles(
      [createMirrorPlugin('~/.claude/settings.json', 'ClaudeCodeCLIOutputPlugin')],
      {
        ...createWriteContext('Ubuntu'),
        pluginOptions: {
          windows: {
            wsl2: {
              instances: 'Ubuntu'
            }
          },
          plugins: {}
        }
      } as OutputWriteContext
    )

    expect(declarations).toEqual([])
  })

  it('collects declared WSL mirror files after an opt-in plugin is explicitly enabled', async () => {
    const declarations = await collectDeclaredWslMirrorFiles(
      [createMirrorPlugin('~/.claude/settings.json', 'ClaudeCodeCLIOutputPlugin')],
      {
        ...createWriteContext('Ubuntu'),
        pluginOptions: {
          windows: {
            wsl2: {
              instances: 'Ubuntu'
            }
          },
          plugins: {
            claudeCode: true
          }
        }
      } as OutputWriteContext
    )

    expect(declarations).toEqual([{sourcePath: '~/.claude/settings.json'}])
  })

  it('copies declared host config files into each resolved WSL home', async () => {
    const memoryFs = new MemoryMirrorFs()
    const hostHomeDir = 'C:\\Users\\alpha'
    const sourcePath = path.win32.join(hostHomeDir, '.codex', 'config.toml')
    const targetHomeDir = '\\\\wsl$\\Ubuntu\\home\\alpha'
    const targetPath = path.win32.join(targetHomeDir, '.codex', 'config.toml')

    memoryFs.seedFile(sourcePath, 'codex = true\n')
    memoryFs.seedDirectory(targetHomeDir)

    const spawnSyncMock = createWslSpawnSyncMock({Ubuntu: '/home/alpha'})

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
    expect(wasWslListCalled(spawnSyncMock)).toBe(false)
  })

  it('copies generated global outputs under the host home into each resolved WSL home', async () => {
    const memoryFs = new MemoryMirrorFs()
    const hostHomeDir = 'C:\\Users\\alpha'
    const sourcePath = path.win32.join(hostHomeDir, '.codex', 'AGENTS.md')
    const targetHomeDir = '\\\\wsl$\\Ubuntu\\home\\alpha'
    const targetPath = path.win32.join(targetHomeDir, '.codex', 'AGENTS.md')
    const plugin = createMirrorPlugin()

    memoryFs.seedFile(sourcePath, 'global prompt\n')
    memoryFs.seedDirectory(targetHomeDir)

    const result = await syncWindowsConfigIntoWsl(
      [plugin],
      createWriteContext('Ubuntu'),
      {
        fs: memoryFs,
        spawnSync: createWslSpawnSyncMock({Ubuntu: '/home/alpha'}) as never,
        platform: 'win32',
        effectiveHomeDir: hostHomeDir
      },
      createPredeclaredOutputs(plugin, [createGlobalOutputDeclaration(sourcePath)])
    )

    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.mirroredFiles).toBe(1)
    expect(memoryFs.readFileSync(targetPath).toString('utf8')).toBe('global prompt\n')
  })

  it('excludes generated Windows app-data globals from WSL mirroring', async () => {
    const memoryFs = new MemoryMirrorFs()
    const hostHomeDir = 'C:\\Users\\alpha'
    const sourcePath = path.win32.join(hostHomeDir, 'AppData', 'Local', 'JetBrains', 'IntelliJIdea2026.1', 'aia', 'codex', 'AGENTS.md')
    const targetHomeDir = '\\\\wsl$\\Ubuntu\\home\\alpha'
    const plugin = createMirrorPlugin()

    memoryFs.seedFile(sourcePath, 'jetbrains prompt\n')
    memoryFs.seedDirectory(targetHomeDir)

    const result = await syncWindowsConfigIntoWsl(
      [plugin],
      createWriteContext('Ubuntu'),
      {
        fs: memoryFs,
        spawnSync: createWslSpawnSyncMock({Ubuntu: '/home/alpha'}) as never,
        platform: 'win32',
        effectiveHomeDir: hostHomeDir
      },
      createPredeclaredOutputs(plugin, [createGlobalOutputDeclaration(sourcePath)])
    )

    expect(result).toEqual({
      mirroredFiles: 0,
      warnings: [],
      errors: []
    })
  })

  it('unions generated globals with declared mirror files and dedupes by source path', async () => {
    const memoryFs = new MemoryMirrorFs()
    const hostHomeDir = 'C:\\Users\\alpha'
    const configPath = path.win32.join(hostHomeDir, '.codex', 'config.toml')
    const authPath = path.win32.join(hostHomeDir, '.codex', 'auth.json')
    const promptPath = path.win32.join(hostHomeDir, '.codex', 'AGENTS.md')
    const targetHomeDir = '\\\\wsl$\\Ubuntu\\home\\alpha'
    const plugin = createMirrorPlugin(['~/.codex/config.toml', '~/.codex/auth.json'])

    memoryFs.seedFile(configPath, 'codex = true\n')
    memoryFs.seedFile(authPath, '{"token":"abc"}\n')
    memoryFs.seedFile(promptPath, 'global prompt\n')
    memoryFs.seedDirectory(targetHomeDir)

    const result = await syncWindowsConfigIntoWsl(
      [plugin],
      createWriteContext('Ubuntu'),
      {
        fs: memoryFs,
        spawnSync: createWslSpawnSyncMock({Ubuntu: '/home/alpha'}) as never,
        platform: 'win32',
        effectiveHomeDir: hostHomeDir
      },
      createPredeclaredOutputs(plugin, [
        createGlobalOutputDeclaration(configPath),
        createGlobalOutputDeclaration(promptPath)
      ])
    )

    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.mirroredFiles).toBe(3)
    expect(memoryFs.readFileSync(path.win32.join(targetHomeDir, '.codex', 'config.toml')).toString('utf8')).toBe('codex = true\n')
    expect(memoryFs.readFileSync(path.win32.join(targetHomeDir, '.codex', 'auth.json')).toString('utf8')).toBe('{"token":"abc"}\n')
    expect(memoryFs.readFileSync(path.win32.join(targetHomeDir, '.codex', 'AGENTS.md')).toString('utf8')).toBe('global prompt\n')
  })

  it('auto-discovers WSL instances when none are configured', async () => {
    const memoryFs = new MemoryMirrorFs()
    const hostHomeDir = 'C:\\Users\\alpha'
    const sourcePath = path.win32.join(hostHomeDir, '.codex', 'config.toml')
    const spawnSyncMock = createWslSpawnSyncMock({
      Ubuntu: '/home/alpha',
      Debian: '/home/beta'
    }, ['Ubuntu', 'Debian'])

    memoryFs.seedFile(sourcePath, 'codex = true\n')
    memoryFs.seedDirectory('\\\\wsl$\\Ubuntu\\home\\alpha')
    memoryFs.seedDirectory('\\\\wsl$\\Debian\\home\\beta')

    const result = await syncWindowsConfigIntoWsl(
      [createMirrorPlugin('~/.codex/config.toml')],
      createWriteContext(),
      {
        fs: memoryFs,
        spawnSync: spawnSyncMock as never,
        platform: 'win32',
        effectiveHomeDir: hostHomeDir
      }
    )

    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.mirroredFiles).toBe(2)
    expect(wasWslListCalled(spawnSyncMock)).toBe(true)
  })

  it('prefers configured WSL instances over auto-discovery', async () => {
    const memoryFs = new MemoryMirrorFs()
    const hostHomeDir = 'C:\\Users\\alpha'
    const sourcePath = path.win32.join(hostHomeDir, '.codex', 'config.toml')
    const spawnSyncMock = createWslSpawnSyncMock({
      Ubuntu: '/home/alpha',
      Debian: '/home/beta'
    }, ['Ubuntu', 'Debian'])

    memoryFs.seedFile(sourcePath, 'codex = true\n')
    memoryFs.seedDirectory('\\\\wsl$\\Ubuntu\\home\\alpha')

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
    expect(wasWslListCalled(spawnSyncMock)).toBe(false)
  })

  it('warns and skips when a declared host config file does not exist', async () => {
    const memoryFs = new MemoryMirrorFs()
    memoryFs.seedDirectory('\\\\wsl$\\Ubuntu\\home\\alpha')

    const result = await syncWindowsConfigIntoWsl(
      [createMirrorPlugin('~/.claude/settings.json')],
      createWriteContext('Ubuntu'),
      {
        fs: memoryFs,
        spawnSync: createWslSpawnSyncMock({Ubuntu: '/home/alpha'}) as never,
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
          stdout: Buffer.alloc(0),
          stderr: Buffer.from('distribution not found', 'utf8')
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

  it('counts dry-run mirror operations without writing explicit mirror files', async () => {
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
        spawnSync: createWslSpawnSyncMock({Ubuntu: '/home/alpha'}) as never,
        platform: 'win32',
        effectiveHomeDir: hostHomeDir
      }
    )

    expect(result.errors).toEqual([])
    expect(result.mirroredFiles).toBe(1)
    expect(memoryFs.existsSync(targetPath)).toBe(false)
  })

  it('counts generated outputs during dry-run even before the host file exists', async () => {
    const memoryFs = new MemoryMirrorFs()
    const hostHomeDir = 'C:\\Users\\alpha'
    const sourcePath = path.win32.join(hostHomeDir, '.codex', 'AGENTS.md')
    const targetHomeDir = '\\\\wsl$\\Ubuntu\\home\\alpha'
    const targetPath = path.win32.join(targetHomeDir, '.codex', 'AGENTS.md')
    const plugin = createMirrorPlugin()

    memoryFs.seedDirectory(targetHomeDir)

    const result = await syncWindowsConfigIntoWsl(
      [plugin],
      createWriteContext('Ubuntu', true),
      {
        fs: memoryFs,
        spawnSync: createWslSpawnSyncMock({Ubuntu: '/home/alpha'}) as never,
        platform: 'win32',
        effectiveHomeDir: hostHomeDir
      },
      createPredeclaredOutputs(plugin, [createGlobalOutputDeclaration(sourcePath)])
    )

    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
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
          stdout: Buffer.alloc(0),
          stderr: Buffer.alloc(0),
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

  it('mirrors declared host config files back into the current WSL home when running inside WSL', async () => {
    const memoryFs = new MemoryMirrorFs()
    const hostHomeDir = '/mnt/c/Users/alpha'
    const nativeHomeDir = '/home/alpha'
    const sourcePath = path.posix.join(hostHomeDir, '.codex', 'config.toml')
    const targetPath = path.posix.join(nativeHomeDir, '.codex', 'config.toml')

    memoryFs.seedFile(sourcePath, 'codex = true\n')
    memoryFs.seedDirectory(nativeHomeDir)

    const result = await syncWindowsConfigIntoWsl(
      [createMirrorPlugin('~/.codex/config.toml')],
      createWriteContext(),
      {
        fs: memoryFs,
        platform: 'linux',
        isWsl: true,
        effectiveHomeDir: hostHomeDir,
        nativeHomeDir
      }
    )

    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.mirroredFiles).toBe(1)
    expect(memoryFs.readFileSync(targetPath).toString('utf8')).toBe('codex = true\n')
  })

  it('mirrors generated global outputs back into the current WSL home when running inside WSL', async () => {
    const memoryFs = new MemoryMirrorFs()
    const hostHomeDir = '/mnt/c/Users/alpha'
    const nativeHomeDir = '/home/alpha'
    const sourcePath = path.posix.join(hostHomeDir, '.codex', 'AGENTS.md')
    const targetPath = path.posix.join(nativeHomeDir, '.codex', 'AGENTS.md')
    const plugin = createMirrorPlugin()

    memoryFs.seedFile(sourcePath, 'global prompt\n')
    memoryFs.seedDirectory(nativeHomeDir)

    const result = await syncWindowsConfigIntoWsl(
      [plugin],
      createWriteContext(),
      {
        fs: memoryFs,
        platform: 'linux',
        isWsl: true,
        effectiveHomeDir: hostHomeDir,
        nativeHomeDir
      },
      createPredeclaredOutputs(plugin, [createGlobalOutputDeclaration(sourcePath)])
    )

    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.mirroredFiles).toBe(1)
    expect(memoryFs.readFileSync(targetPath).toString('utf8')).toBe('global prompt\n')
  })
})
