import {afterEach, describe, expect, it, vi} from 'vitest'

const {
  createDefaultPluginConfigMock,
  pipelineRunMock,
  pluginPipelineCtorMock
} = vi.hoisted(() => ({
  createDefaultPluginConfigMock: vi.fn(),
  pipelineRunMock: vi.fn(),
  pluginPipelineCtorMock: vi.fn()
}))

vi.mock('./plugin.config', () => ({
  createDefaultPluginConfig: createDefaultPluginConfigMock
}))

vi.mock('./PluginPipeline', () => ({
  PluginPipeline: function MockPluginPipeline(...args: unknown[]) {
    pluginPipelineCtorMock(...args)
    return {
      run: pipelineRunMock
    }
  }
}))

afterEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

describe('cli runtime lightweight commands', () => {
  it('does not load plugin config for --version', async () => {
    const {runCli} = await import('./cli-runtime')

    const exitCode = await runCli(['node', 'tnmsc', '--version'])

    expect(exitCode).toBe(0)
    expect(createDefaultPluginConfigMock).not.toHaveBeenCalled()
    expect(pluginPipelineCtorMock).not.toHaveBeenCalled()
    expect(pipelineRunMock).not.toHaveBeenCalled()
  })

  it('emits JSON for --version --json without loading plugin config', async () => {
    const {runCli} = await import('./cli-runtime')
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    try {
      const exitCode = await runCli(['node', 'tnmsc', '--version', '--json'])

      expect(exitCode).toBe(0)
      expect(createDefaultPluginConfigMock).not.toHaveBeenCalled()
      expect(pluginPipelineCtorMock).not.toHaveBeenCalled()
      expect(pipelineRunMock).not.toHaveBeenCalled()

      const payload = JSON.parse(String(writeSpy.mock.calls[0]?.[0])) as {
        readonly success: boolean
        readonly message?: string
      }

      expect(payload.success).toBe(true)
      expect(payload.message).toBe('Version displayed')
    }
    finally {
      writeSpy.mockRestore()
    }
  })
})
