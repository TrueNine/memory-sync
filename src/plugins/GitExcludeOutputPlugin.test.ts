import {describe, expect, it, vi} from 'vitest'
import {createLogger} from '@/log'
import {GitExcludeOutputPlugin} from './GitExcludeOutputPlugin'

describe('gitExcludeOutputPlugin', () => {
  it('should write to .git/info/exclude in projects', async () => {
    const plugin = new GitExcludeOutputPlugin() // Mock fs needed for internal calls if we were mocking fs, but we mock ensureDirectory/writeFile since we mock the plugin context/methods or use spies.

    const ctx = {
      ensureDirectory: vi.fn(),
      writeFile: vi.fn(),
      collectedInputContext: {
        globalGitIgnore: 'dist/',
        workspace: {
          directory: {
            path: '/ws',
          },
          projects: [
            {
              dirFromWorkspacePath: {
                getAbsolutePath: () => '/ws/project1',
              },
            },
          ],
        },
      },
      logger: createLogger('test', 'debug'),
      dryRun: false,
    } as any

    const writeFileSpy = vi.spyOn(plugin as any, 'writeFile')
    writeFileSpy.mockResolvedValue({success: true})

    vi.spyOn(plugin as any, 'existsSync').mockReturnValue(true)

    await plugin.write(ctx)

    expect(writeFileSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringMatching(/project1.*\.git.*info.*exclude/),
      'dist/',
      expect.stringContaining('GitExclude'),
    )
  })

  it('should skip if no globalGitIgnore', async () => {
    const plugin = new GitExcludeOutputPlugin()
    const ctx = {
      collectedInputContext: {},
      logger: createLogger('test', 'debug'),
    } as unknown as import('@/types').OutputWriteContext

    const writeFileSpy = vi.spyOn(plugin as any, 'writeFile')

    await plugin.write(ctx)

    expect(writeFileSpy).not.toHaveBeenCalled()
  })
})
