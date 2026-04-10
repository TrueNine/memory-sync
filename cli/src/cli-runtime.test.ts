import {afterEach, describe, expect, it, vi} from 'vitest'

const {
  cleanMock,
  dryRunMock,
  installMock,
  listPluginsMock
} = vi.hoisted(() => ({
  cleanMock: vi.fn(),
  dryRunMock: vi.fn(),
  installMock: vi.fn(),
  listPluginsMock: vi.fn()
}))

vi.mock('@truenine/memory-sync-sdk', () => ({
  getMemorySyncSdkBinding() {
    return {
      install: installMock,
      dryRun: dryRunMock,
      clean: cleanMock,
      listPlugins: listPluginsMock
    }
  }
}))

afterEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  delete process.env['TNMSC_DISABLE_NATIVE_COMMAND_BINDING']
  delete process.env['TNMSC_DISABLE_NATIVE_BINDING']
})

describe('cli runtime lightweight commands', () => {
  it('disables native command binding without disabling native helpers', async () => {
    delete process.env['TNMSC_DISABLE_NATIVE_COMMAND_BINDING']
    delete process.env['TNMSC_DISABLE_NATIVE_BINDING']

    await import('./cli-runtime')

    expect(process.env['TNMSC_DISABLE_NATIVE_COMMAND_BINDING']).toBe('1')
    expect(process.env['TNMSC_DISABLE_NATIVE_BINDING']).toBeUndefined()
  })

  it('does not touch the sdk binding for --version', async () => {
    const {runCli} = await import('./cli-runtime')
    const exitCode = await runCli(['node', 'tnmsc', '--version'])
    expect(exitCode).toBe(0)
    expect(installMock).not.toHaveBeenCalled()
    expect(dryRunMock).not.toHaveBeenCalled()
    expect(cleanMock).not.toHaveBeenCalled()
  })

  it('passes the real cwd into the sdk install path', async () => {
    const {runCli} = await import('./cli-runtime')
    installMock.mockResolvedValue({
      success: true,
      filesAffected: 0,
      dirsAffected: 0,
      warnings: [],
      errors: []
    })

    const exitCode = await runCli(['node', 'tnmsc'])

    expect(exitCode).toBe(0)
    expect(installMock).toHaveBeenCalledWith({
      cwd: process.cwd()
    })
    expect(dryRunMock).not.toHaveBeenCalled()
    expect(cleanMock).not.toHaveBeenCalled()
  })
})
