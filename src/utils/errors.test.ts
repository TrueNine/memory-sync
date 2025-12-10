import { describe, expect, it } from 'vitest'
import { ConfigurationError, FileSystemError, ScriptsError } from './errors'

describe('ScriptsError', () => {
  it('should create error with message and code', () => {
    const error = new ScriptsError('Test error', 'TEST_ERROR')

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(ScriptsError)
    expect(error.message).toBe('Test error')
    expect(error.code).toBe('TEST_ERROR')
    expect(error.name).toBe('ScriptsError')
    expect(error.context).toBeUndefined()
  })

  it('should create error with context', () => {
    const context = { key: 'value', count: 42 }
    const error = new ScriptsError('Test error', 'TEST_ERROR', context)

    expect(error.message).toBe('Test error')
    expect(error.code).toBe('TEST_ERROR')
    expect(error.context).toEqual(context)
  })

  it('should have stack trace', () => {
    const error = new ScriptsError('Test error', 'TEST_ERROR')

    expect(error.stack).toBeDefined()
    expect(error.stack).toContain('ScriptsError')
  })
})

describe('FileSystemError', () => {
  it('should create error with path', () => {
    const error = new FileSystemError('File not found', '/path/to/file.txt')

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(ScriptsError)
    expect(error).toBeInstanceOf(FileSystemError)
    expect(error.message).toBe('File not found')
    expect(error.code).toBe('FS_ERROR')
    expect(error.name).toBe('FileSystemError')
    expect(error.context).toEqual({ path: '/path/to/file.txt', cause: undefined })
  })

  it('should create error with path and cause', () => {
    const cause = new Error('ENOENT: no such file or directory')
    const error = new FileSystemError('File not found', '/path/to/file.txt', cause)

    expect(error.message).toBe('File not found')
    expect(error.code).toBe('FS_ERROR')
    expect(error.context).toEqual({
      path: '/path/to/file.txt',
      cause: 'ENOENT: no such file or directory',
    })
  })

  it('should inherit from ScriptsError', () => {
    const error = new FileSystemError('Test error', '/test/path')

    expect(error).toBeInstanceOf(ScriptsError)
    expect(error.code).toBe('FS_ERROR')
  })
})

describe('ConfigurationError', () => {
  it('should create error with key', () => {
    const error = new ConfigurationError('Invalid configuration', 'database.host')

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(ScriptsError)
    expect(error).toBeInstanceOf(ConfigurationError)
    expect(error.message).toBe('Invalid configuration')
    expect(error.code).toBe('CONFIG_ERROR')
    expect(error.name).toBe('ConfigurationError')
    expect(error.context).toEqual({ key: 'database.host', value: undefined })
  })

  it('should create error with key and value', () => {
    const error = new ConfigurationError('Invalid port', 'server.port', 'invalid')

    expect(error.message).toBe('Invalid port')
    expect(error.code).toBe('CONFIG_ERROR')
    expect(error.context).toEqual({ key: 'server.port', value: 'invalid' })
  })

  it('should inherit from ScriptsError', () => {
    const error = new ConfigurationError('Test error', 'test.key')

    expect(error).toBeInstanceOf(ScriptsError)
    expect(error.code).toBe('CONFIG_ERROR')
  })
})
