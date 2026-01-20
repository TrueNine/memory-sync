import * as fs from 'node:fs'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {createLogger} from '@/log'
import {GitExcludeOutputPlugin} from './GitExcludeOutputPlugin'

vi.mock('node:fs')

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

    vi.mocked(fs.existsSync).mockImplementation((p: any) => {
      const s = String(p)
      return s.includes('project1') && s.includes('.git') && (s.endsWith('info') || s.endsWith('exclude')) // Only match project .git/info, not workspace root
    })

    vi.mocked(fs.readFileSync).mockReturnValue('# existing content\n')
    const spy = vi.mocked(fs.writeFileSync).mockImplementation(() => {})
    vi.mocked(fs.mkdirSync).mockImplementation(() => '')

    const result = await plugin.writeProjectOutputs(ctx)

    expect(result.files.length).toBeGreaterThanOrEqual(1)
    expect(spy).toHaveBeenCalled()
    const writtenContent = spy.mock.calls[0][1] as string
    expect(writtenContent).toContain('# existing content')
    expect(writtenContent).toContain('dist/')
    expect(writtenContent).toContain('# >>> tnmsc managed start >>>')
    expect(writtenContent).toContain('# <<< tnmsc managed end <<<')
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

    vi.mocked(fs.existsSync).mockImplementation((p: any) => {
      const s = String(p)
      return s.includes('.git') && s.endsWith('info')
    })

    vi.mocked(fs.readFileSync).mockReturnValue('')
    const spy = vi.mocked(fs.writeFileSync).mockImplementation(() => {})
    vi.mocked(fs.mkdirSync).mockImplementation(() => '')

    await plugin.writeProjectOutputs(ctx)

    const writtenContent = spy.mock.calls[0][1] as string
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

    vi.mocked(fs.existsSync).mockImplementation((p: any) => {
      const s = String(p)
      return s.includes('.git') && (s.endsWith('info') || s.endsWith('exclude'))
    })

    const existingContent = `# user content
# >>> tnmsc managed start >>>
old-content/
# <<< tnmsc managed end <<<
# more user content`

    vi.mocked(fs.readFileSync).mockReturnValue(existingContent)
    const spy = vi.mocked(fs.writeFileSync).mockImplementation(() => {})
    vi.mocked(fs.mkdirSync).mockImplementation(() => '')

    await plugin.writeProjectOutputs(ctx)

    const writtenContent = spy.mock.calls[0][1] as string
    expect(writtenContent).toContain('# user content')
    expect(writtenContent).toContain('new-content/')
    expect(writtenContent).toContain('# more user content')
    expect(writtenContent).not.toContain('old-content/')
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

    vi.mocked(fs.existsSync).mockImplementation((p: any) => {
      const s = String(p)
      return s.includes('.git') && s.endsWith('info')
    })

    vi.mocked(fs.readFileSync).mockReturnValue('')
    const spy = vi.mocked(fs.writeFileSync).mockImplementation(() => {})
    vi.mocked(fs.mkdirSync).mockImplementation(() => '')

    await plugin.writeProjectOutputs(ctx)

    const writtenContent = spy.mock.calls[0][1] as string
    expect(writtenContent).toContain('.cache/')
  })
})
