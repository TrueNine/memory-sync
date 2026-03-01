import * as fs from 'node:fs'
import {createLogger} from '@truenine/plugin-shared'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {GitExcludeOutputPlugin} from './GitExcludeOutputPlugin'

vi.mock('node:fs')

const dirStat = {isDirectory: () => true, isFile: () => false} as any
const fileStat = {isDirectory: () => false, isFile: () => true} as any

function setupFsMocks(existsFn: (p: string) => boolean, lstatFn?: (p: string) => any): void {
  vi.mocked(fs.existsSync).mockImplementation((p: any) => existsFn(String(p)))
  vi.mocked(fs.lstatSync).mockImplementation((p: any) => {
    if (lstatFn) return lstatFn(String(p))
    return String(p).endsWith('.git') ? dirStat : fileStat // Default: .git is a directory
  })
  vi.mocked(fs.readdirSync).mockReturnValue([] as any) // Default: empty dirs for findAllGitRepos scanning
  vi.mocked(fs.readFileSync).mockReturnValue('')
  vi.mocked(fs.writeFileSync).mockImplementation(() => {})
  vi.mocked(fs.mkdirSync).mockImplementation(() => '')
}

describe('gitExcludeOutputPlugin', () => {
  beforeEach(() => vi.clearAllMocks())

  it('should write to git exclude in projects with merge', async () => {
    const plugin = new GitExcludeOutputPlugin()

    const ctx = {
      collectedInputContext: {
        globalGitIgnore: 'dist/',
        workspace: {
          directory: {path: '/ws'},
          projects: [
            {
              name: 'project1',
              dirFromWorkspacePath: {
                path: 'project1',
                basePath: '/ws',
                getAbsolutePath: () => '/ws/project1'
              },
              isPromptSourceProject: false
            }
          ]
        }
      },
      logger: createLogger('test', 'debug'),
      dryRun: false
    } as any

    setupFsMocks(p => p.includes('project1') && p.includes('.git'))

    const spy = vi.mocked(fs.writeFileSync)
    const result = await plugin.writeProjectOutputs(ctx)

    expect(result.files.length).toBeGreaterThanOrEqual(1)
    expect(spy).toHaveBeenCalled()
    const firstCall = spy.mock.calls[0]
    const writtenContent = (firstCall?.[1] ?? '') as string
    expect(writtenContent).toBe('dist/\n')
  })

  it('should skip if no globalGitIgnore and no shadowGitExclude', async () => {
    const plugin = new GitExcludeOutputPlugin()
    const ctx = {
      collectedInputContext: {
        workspace: {
          directory: {path: '/ws'},
          projects: []
        }
      },
      logger: createLogger('test', 'debug'),
      dryRun: false
    } as any

    const result = await plugin.writeProjectOutputs(ctx)
    expect(result.files).toHaveLength(0)
  })

  it('should merge globalGitIgnore and shadowGitExclude', async () => {
    const plugin = new GitExcludeOutputPlugin()

    const ctx = {
      collectedInputContext: {
        globalGitIgnore: 'node_modules/',
        shadowGitExclude: '.idea/\n*.log',
        workspace: {
          directory: {path: '/ws'},
          projects: [
            {
              name: 'project1',
              dirFromWorkspacePath: {
                path: 'project1',
                basePath: '/ws',
                getAbsolutePath: () => '/ws/project1'
              },
              isPromptSourceProject: false
            }
          ]
        }
      },
      logger: createLogger('test', 'debug'),
      dryRun: false
    } as any

    setupFsMocks(p => p.includes('.git'))

    const spy = vi.mocked(fs.writeFileSync)
    await plugin.writeProjectOutputs(ctx)

    const firstCall = spy.mock.calls[0]
    const writtenContent = (firstCall?.[1] ?? '') as string
    expect(writtenContent).toContain('node_modules/')
    expect(writtenContent).toContain('.idea/')
    expect(writtenContent).toContain('*.log')
  })

  it('should replace existing managed section', async () => {
    const plugin = new GitExcludeOutputPlugin()

    const ctx = {
      collectedInputContext: {
        globalGitIgnore: 'new-content/',
        workspace: {
          directory: {path: '/ws'},
          projects: [
            {
              name: 'project1',
              dirFromWorkspacePath: {
                path: 'project1',
                basePath: '/ws',
                getAbsolutePath: () => '/ws/project1'
              },
              isPromptSourceProject: false
            }
          ]
        }
      },
      logger: createLogger('test', 'debug'),
      dryRun: false
    } as any

    setupFsMocks(p => p.includes('.git'))

    const spy = vi.mocked(fs.writeFileSync)
    await plugin.writeProjectOutputs(ctx)

    const firstCall = spy.mock.calls[0]
    const writtenContent = (firstCall?.[1] ?? '') as string
    expect(writtenContent).toBe('new-content/\n')
  })

  it('should work with only shadowGitExclude', async () => {
    const plugin = new GitExcludeOutputPlugin()

    const ctx = {
      collectedInputContext: {
        shadowGitExclude: '.cache/',
        workspace: {
          directory: {path: '/ws'},
          projects: [
            {
              name: 'project1',
              dirFromWorkspacePath: {
                path: 'project1',
                basePath: '/ws',
                getAbsolutePath: () => '/ws/project1'
              },
              isPromptSourceProject: false
            }
          ]
        }
      },
      logger: createLogger('test', 'debug'),
      dryRun: false
    } as any

    setupFsMocks(p => p.includes('.git'))

    const spy = vi.mocked(fs.writeFileSync)
    await plugin.writeProjectOutputs(ctx)

    const firstCall = spy.mock.calls[0]
    const writtenContent = (firstCall?.[1] ?? '') as string
    expect(writtenContent).toContain('.cache/')
  })

  it('should resolve submodule .git file with gitdir pointer', async () => {
    const plugin = new GitExcludeOutputPlugin()

    const ctx = {
      collectedInputContext: {
        globalGitIgnore: '.kiro/',
        workspace: {
          directory: {path: '/ws'},
          projects: [
            {
              name: 'submod',
              dirFromWorkspacePath: {
                path: 'submod',
                basePath: '/ws',
                getAbsolutePath: () => '/ws/submod'
              },
              isPromptSourceProject: false
            }
          ]
        }
      }
    } as any

    vi.mocked(fs.existsSync).mockImplementation((p: any) => {
      const s = String(p).replaceAll('\\', '/')
      return s === '/ws/submod/.git' || s === '/ws/.git'
    })
    vi.mocked(fs.lstatSync).mockImplementation((p: any) => {
      const s = String(p).replaceAll('\\', '/')
      if (s === '/ws/submod/.git') return fileStat // submodule: .git is a file
      return dirStat // workspace root: .git is a directory
    })
    vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
      const s = String(p).replaceAll('\\', '/')
      if (s === '/ws/submod/.git') return 'gitdir: ../.git/modules/submod'
      return ''
    })
    vi.mocked(fs.readdirSync).mockReturnValue([] as any)
    const results = await plugin.registerProjectOutputFiles(ctx)
    const absPaths = results.map(r => r.getAbsolutePath().replaceAll('\\', '/'))
    expect(absPaths).toContainEqual(expect.stringContaining('.git/modules/submod/info/exclude'))
  })

  it('should write to .git/modules/*/info/exclude directly', async () => {
    const plugin = new GitExcludeOutputPlugin()

    const ctx = {
      collectedInputContext: {
        globalGitIgnore: '.kiro/',
        workspace: {
          directory: {path: '/ws'},
          projects: []
        }
      }
    } as any

    const infoDirent = {name: 'info', isDirectory: () => true, isFile: () => false} as any
    const modADirent = {name: 'modA', isDirectory: () => true, isFile: () => false} as any
    const modBDirent = {name: 'modB', isDirectory: () => true, isFile: () => false} as any

    vi.mocked(fs.existsSync).mockImplementation((p: any) => {
      const s = String(p).replaceAll('\\', '/')
      return s === '/ws/.git' || s === '/ws/.git/modules'
    })
    vi.mocked(fs.lstatSync).mockReturnValue(dirStat)
    vi.mocked(fs.readdirSync).mockImplementation((p: any) => {
      const s = String(p).replaceAll('\\', '/')
      if (s === '/ws/.git/modules') return [modADirent, modBDirent] as any
      if (s === '/ws/.git/modules/modA') return [infoDirent] as any
      if (s === '/ws/.git/modules/modB') return [infoDirent] as any
      return [] as any
    })
    const results = await plugin.registerProjectOutputFiles(ctx)
    const absPaths = results.map(r => r.getAbsolutePath().replaceAll('\\', '/'))
    expect(absPaths).toContain('/ws/.git/modules/modA/info/exclude')
    expect(absPaths).toContain('/ws/.git/modules/modB/info/exclude')
  })
})
