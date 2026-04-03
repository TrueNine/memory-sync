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

function createEmptyProjectsBySeries() {
  return {
    app: [],
    ext: [],
    arch: [],
    softwares: []
  }
}

vi.mock('./plugin.config', () => ({
  createDefaultPluginConfig: createDefaultPluginConfigMock
}))

vi.mock('./PluginPipeline', () => ({
  PluginPipeline: function MockPluginPipeline(...args: unknown[]) {
    pluginPipelineCtorMock(...args)
    return {run: pipelineRunMock}
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

  it('passes the real cwd into the standard plugin config path', async () => {
    const {runCli} = await import('./cli-runtime')
    createDefaultPluginConfigMock.mockResolvedValue({
      context: {
        workspace: {
          directory: {
            pathKind: 'absolute',
            path: process.cwd(),
            getDirectoryName: () => 'cwd'
          },
          projects: []
        }
      },
      outputPlugins: [],
      userConfigOptions: {},
      executionPlan: {
        scope: 'workspace',
        cwd: process.cwd(),
        workspaceDir: process.cwd(),
        projectsBySeries: createEmptyProjectsBySeries()
      }
    })
    pipelineRunMock.mockResolvedValue({
      success: true,
      filesAffected: 0,
      dirsAffected: 0
    })

    const exitCode = await runCli(['node', 'tnmsc'])

    expect(exitCode).toBe(0)
    expect(createDefaultPluginConfigMock).toHaveBeenCalledWith(
      ['node', 'tnmsc'],
      void 0,
      process.cwd()
    )
    expect(pluginPipelineCtorMock).toHaveBeenCalledWith('node', 'tnmsc')
    expect(pipelineRunMock).toHaveBeenCalledTimes(1)
  })
})
