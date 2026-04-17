import {EventEmitter} from 'node:events'
import {afterEach, describe, expect, it, vi} from 'vitest'

const {resolveTnmscBinaryMock, spawnMock} = vi.hoisted(() => ({
  resolveTnmscBinaryMock: vi.fn(() => '/native/tnmsc'),
  spawnMock: vi.fn()
}))

vi.mock('./resolve-binary', () => ({
  resolveTnmscBinary: resolveTnmscBinaryMock
}))

vi.mock('node:child_process', () => ({
  spawn: spawnMock
}))

class MockChildProcess extends EventEmitter {}

afterEach(() => {
  vi.clearAllMocks()
  resolveTnmscBinaryMock.mockReturnValue('/native/tnmsc')
})

describe('cli runtime native launcher', () => {
  it('forwards argv to the native tnmsc binary', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const {runCli} = await import('./cli-runtime')
    const promise = runCli(['node', 'tnmsc', 'dry-run', '--debug'])
    child.emit('exit', 0, null)
    const exitCode = await promise

    expect(exitCode).toBe(0)
    expect(spawnMock).toHaveBeenCalledTimes(1)
    const [binaryPath, args, options] = spawnMock.mock.calls[0] as [string, string[], {stdio?: string}]
    expect(binaryPath).toBe('/native/tnmsc')
    expect(args).toEqual(['dry-run', '--debug'])
    expect(options.stdio).toBe('inherit')
  })

  it('returns the native process exit code', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const {runCli} = await import('./cli-runtime')
    const promise = runCli(['node', 'tnmsc', 'install'])
    child.emit('exit', 7, null)
    const exitCode = await promise

    expect(exitCode).toBe(7)
  })

  it('fails fast when the native binary cannot be resolved', async () => {
    resolveTnmscBinaryMock.mockImplementation(() => {
      throw new Error('missing native binary')
    })

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const {runCli} = await import('./cli-runtime')
    const exitCode = await runCli(['node', 'tnmsc', 'dry-run'])

    expect(exitCode).toBe(1)
    expect(spawnMock).not.toHaveBeenCalled()
    expect(stderrSpy).toHaveBeenCalledWith('[tnmsc] missing native binary\n')

    stderrSpy.mockRestore()
  })

  it('reports native process spawn failures', async () => {
    const child = new MockChildProcess()
    spawnMock.mockReturnValue(child)

    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

    const {runCli} = await import('./cli-runtime')
    const promise = runCli(['node', 'tnmsc', 'install'])
    child.emit('error', new Error('spawn failed'))
    const exitCode = await promise

    expect(exitCode).toBe(1)
    expect(stderrSpy).toHaveBeenCalledWith('[tnmsc] spawn failed\n')

    stderrSpy.mockRestore()
  })
})
