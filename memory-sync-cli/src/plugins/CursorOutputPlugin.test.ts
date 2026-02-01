import type {OutputPluginContext, OutputWriteContext} from '@/types'
import type {RelativePath} from '@/types/FileSystemTypes'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {createLogger} from '@/log'
import {FilePathKind} from '@/types'
import {CursorOutputPlugin} from './CursorOutputPlugin'

function createMockRelativePath(pathStr: string, basePath: string): RelativePath {
  return {
    pathKind: FilePathKind.Relative,
    path: pathStr,
    basePath,
    getDirectoryName: () => pathStr,
    getAbsolutePath: () => path.join(basePath, pathStr)
  }
}

class TestableCursorOutputPlugin extends CursorOutputPlugin {
  private mockHomeDir: string | null = null

  public setMockHomeDir(dir: string | null): void {
    this.mockHomeDir = dir
  }

  protected override getHomeDir(): string {
    if (this.mockHomeDir != null) return this.mockHomeDir
    return super.getHomeDir()
  }
}

describe('cursor output plugin', () => {
  let tempDir: string, plugin: TestableCursorOutputPlugin

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursor-mcp-test-'))
    plugin = new TestableCursorOutputPlugin()
    plugin.setMockHomeDir(tempDir)
  })

  afterEach(() => {
    if (tempDir != null && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, {recursive: true, force: true})
      }
      catch { // ignore cleanup errors
      }
    }
  })

  describe('constructor', () => {
    it('should have correct plugin name', () => expect(plugin.name).toBe('CursorOutputPlugin'))

    it('should depend on AgentsOutputPlugin', () => expect(plugin.dependsOn).toContain('AgentsOutputPlugin'))
  })

  describe('registerGlobalOutputFiles', () => {
    it('should register mcp.json when any skill has mcpConfig', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [
            {
              yamlFrontMatter: {name: 'skill-a'},
              dir: createMockRelativePath('skill-a', tempDir),
              mcpConfig: {
                mcpServers: {foo: {command: 'npx', args: ['-y', 'mcp-foo']}}
              }
            }
          ]
        }
      } as unknown as OutputPluginContext

      const results = await plugin.registerGlobalOutputFiles(ctx)
      expect(results).toHaveLength(1)
      expect(results[0].path).toBe('mcp.json')
      expect(results[0].getAbsolutePath()).toBe(path.join(tempDir, '.cursor', 'mcp.json'))
    })

    it('should not register mcp.json when no skill has mcpConfig', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [
            {yamlFrontMatter: {name: 'skill-a'}, dir: createMockRelativePath('skill-a', tempDir)}
          ]
        }
      } as unknown as OutputPluginContext

      const results = await plugin.registerGlobalOutputFiles(ctx)
      expect(results).toHaveLength(0)
    })

    it('should not register mcp.json when skills is empty', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: []
        }
      } as unknown as OutputPluginContext

      const results = await plugin.registerGlobalOutputFiles(ctx)
      expect(results).toHaveLength(0)
    })
  })

  describe('canWrite', () => {
    it('should return true when skills exist', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [{yamlFrontMatter: {name: 's'}, dir: createMockRelativePath('s', tempDir)}]
        }
      } as unknown as OutputWriteContext

      const result = await plugin.canWrite(ctx)
      expect(result).toBe(true)
    })

    it('should return false when no skills', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: []
        }
      } as unknown as OutputWriteContext

      const result = await plugin.canWrite(ctx)
      expect(result).toBe(false)
    })
  })

  describe('writeGlobalOutputs', () => {
    it('should write merged mcp.json with stdio server from skills', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [
            {
              yamlFrontMatter: {name: 'skill-a'},
              dir: createMockRelativePath('skill-a', tempDir),
              mcpConfig: {
                mcpServers: {
                  myServer: {command: 'npx', args: ['-y', 'mcp-server'], env: {API_KEY: 'secret'}}
                }
              }
            }
          ]
        },
        logger: createLogger('test', 'debug'),
        dryRun: false
      } as unknown as OutputWriteContext

      const results = await plugin.writeGlobalOutputs(ctx)
      expect(results.files).toHaveLength(1)
      expect(results.files[0].path.path).toBe('mcp.json')
      expect(results.files[0].success).toBe(true)

      const mcpPath = path.join(tempDir, '.cursor', 'mcp.json')
      expect(fs.existsSync(mcpPath)).toBe(true)
      const content = JSON.parse(fs.readFileSync(mcpPath, 'utf8')) as Record<string, unknown>
      expect(content.mcpServers).toBeDefined()
      const servers = content.mcpServers as Record<string, unknown>
      expect(servers.myServer).toEqual({
        command: 'npx',
        args: ['-y', 'mcp-server'],
        env: {API_KEY: 'secret'}
      })
    })

    it('should merge with existing mcp.json and preserve user entries', async () => {
      const cursorDir = path.join(tempDir, '.cursor')
      fs.mkdirSync(cursorDir, {recursive: true})
      const mcpPath = path.join(cursorDir, 'mcp.json')
      const existing = {
        mcpServers: {
          userServer: {command: 'python', args: ['server.py']},
          fromSkill: {url: 'https://old.example.com/mcp'}
        }
      }
      fs.writeFileSync(mcpPath, JSON.stringify(existing, null, 2))

      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [
            {
              yamlFrontMatter: {name: 'skill-a'},
              dir: createMockRelativePath('skill-a', tempDir),
              mcpConfig: {
                mcpServers: {
                  fromSkill: {command: 'npx', args: ['-y', 'new-skill-mcp']}
                }
              }
            }
          ]
        },
        logger: createLogger('test', 'debug'),
        dryRun: false
      } as unknown as OutputWriteContext

      await plugin.writeGlobalOutputs(ctx)

      const content = JSON.parse(fs.readFileSync(mcpPath, 'utf8')) as Record<string, unknown>
      const servers = content.mcpServers as Record<string, unknown>
      expect(servers.userServer).toEqual({command: 'python', args: ['server.py']})
      expect(servers.fromSkill).toEqual({command: 'npx', args: ['-y', 'new-skill-mcp']})
    })

    it('should transform remote server url or serverUrl to url', async () => {
      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)},
          skills: [
            {
              yamlFrontMatter: {name: 'skill-remote'},
              dir: createMockRelativePath('skill-remote', tempDir),
              mcpConfig: {
                mcpServers: {
                  remote: {serverUrl: 'https://api.example.com/mcp', headers: {Authorization: 'Bearer x'}}
                }
              }
            }
          ]
        },
        logger: createLogger('test', 'debug'),
        dryRun: false
      } as unknown as OutputWriteContext

      await plugin.writeGlobalOutputs(ctx)

      const mcpPath = path.join(tempDir, '.cursor', 'mcp.json')
      const content = JSON.parse(fs.readFileSync(mcpPath, 'utf8')) as Record<string, unknown>
      const servers = content.mcpServers as Record<string, unknown>
      expect(servers.remote).toEqual({
        url: 'https://api.example.com/mcp',
        headers: {Authorization: 'Bearer x'}
      })
    })
  })

  describe('clean effect', () => {
    it('should reset mcp.json to empty mcpServers shell on clean', async () => {
      const cursorDir = path.join(tempDir, '.cursor')
      fs.mkdirSync(cursorDir, {recursive: true})
      const mcpPath = path.join(cursorDir, 'mcp.json')
      fs.writeFileSync(mcpPath, JSON.stringify({mcpServers: {some: {command: 'npx'}}}, null, 2))

      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)}
        },
        logger: createLogger('test', 'debug'),
        dryRun: false
      } as any

      await plugin.onCleanComplete(ctx)

      expect(fs.existsSync(mcpPath)).toBe(true)
      const content = JSON.parse(fs.readFileSync(mcpPath, 'utf8')) as Record<string, unknown>
      expect(content).toEqual({mcpServers: {}})
    })

    it('should not write on clean when dryRun is true', async () => {
      const cursorDir = path.join(tempDir, '.cursor')
      fs.mkdirSync(cursorDir, {recursive: true})
      const mcpPath = path.join(cursorDir, 'mcp.json')
      const original = {mcpServers: {keep: {command: 'npx'}}}
      fs.writeFileSync(mcpPath, JSON.stringify(original, null, 2))

      const ctx = {
        collectedInputContext: {
          workspace: {projects: [], directory: createMockRelativePath('.', tempDir)}
        },
        logger: createLogger('test', 'debug'),
        dryRun: true
      } as any

      await plugin.onCleanComplete(ctx)

      const content = JSON.parse(fs.readFileSync(mcpPath, 'utf8')) as Record<string, unknown>
      expect(content).toEqual(original)
    })
  })

  describe('project outputs', () => {
    it('should not implement writeProjectOutputs', () => expect(plugin.writeProjectOutputs).toBeUndefined())

    it('should not register project output files or dirs', () => {
      expect(plugin.registerProjectOutputFiles).toBeUndefined()
      expect(plugin.registerProjectOutputDirs).toBeUndefined()
    })

    it('should not register global output dirs', () => expect(plugin.registerGlobalOutputDirs).toBeUndefined())
  })
})
