import {mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it, vi} from 'vitest'

const {cleanMock, dryRunMock, installMock} = vi.hoisted(() => ({
  cleanMock: vi.fn(),
  dryRunMock: vi.fn(),
  installMock: vi.fn()
}))

vi.mock('./sdk-binding', () => ({
  createTsFallbackMemorySyncBinding() {
    return {
      install: installMock,
      dryRun: dryRunMock,
      clean: cleanMock
    }
  }
}))

afterEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
})

describe('internal native command bridge', () => {
  it('preserves explicit logging for install dispatch', async () => {
    installMock.mockResolvedValue({
      success: true,
      filesAffected: 3,
      dirsAffected: 1,
      warnings: [],
      errors: []
    })

    const {executeInternalBridgeCommand} = await import('./native-command-bridge')
    const result = await executeInternalBridgeCommand('install', JSON.stringify({
      cwd: '/workspace/demo',
      logLevel: 'debug'
    }))

    expect(result).toMatchObject({
      success: true,
      filesAffected: 3,
      dirsAffected: 1
    })
    expect(installMock).toHaveBeenCalledWith({
      cwd: '/workspace/demo',
      logLevel: 'debug'
    })
  })

  it('passes dryRun through clean dispatch without injecting a log level', async () => {
    cleanMock.mockResolvedValue({
      success: true,
      filesAffected: 5,
      dirsAffected: 2,
      warnings: [],
      errors: []
    })

    const {executeInternalBridgeCommand} = await import('./native-command-bridge')
    const result = await executeInternalBridgeCommand('clean', JSON.stringify({
      cwd: '/workspace/demo',
      dryRun: true
    }))

    expect(result).toMatchObject({
      success: true,
      filesAffected: 5,
      dirsAffected: 2
    })
    expect(cleanMock).toHaveBeenCalledWith({
      cwd: '/workspace/demo',
      dryRun: true
    })
  })

  it('supports a bundle smoke self-test without loading runtime dependencies', async () => {
    const {executeInternalBridgeCommand} = await import('./native-command-bridge')

    await expect(executeInternalBridgeCommand('self-test')).resolves.toEqual({
      ok: true,
      command: 'self-test'
    })
    expect(installMock).not.toHaveBeenCalled()
    expect(dryRunMock).not.toHaveBeenCalled()
    expect(cleanMock).not.toHaveBeenCalled()
  })

  it('writes the result payload to the bridge result path when requested', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'tnmsc-bridge-result-'))
    const resultPath = join(tempDir, 'result.json')
    const previousResultPath = process.env['TNMSC_INTERNAL_COMMAND_BRIDGE_RESULT_PATH']
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    process.env['TNMSC_INTERNAL_COMMAND_BRIDGE_RESULT_PATH'] = resultPath

    try {
      const {runInternalBridgeCli} = await import('./native-command-bridge')
      await runInternalBridgeCli(['self-test'])

      expect(readFileSync(resultPath, 'utf8')).toBe(JSON.stringify({
        ok: true,
        command: 'self-test'
      }))
      expect(stdoutSpy).not.toHaveBeenCalled()
    }
    finally {
      stdoutSpy.mockRestore()

      if (previousResultPath == null) {
        delete process.env['TNMSC_INTERNAL_COMMAND_BRIDGE_RESULT_PATH']
      } else {
        process.env['TNMSC_INTERNAL_COMMAND_BRIDGE_RESULT_PATH'] = previousResultPath
      }

      rmSync(tempDir, {recursive: true, force: true})
    }
  })
})
