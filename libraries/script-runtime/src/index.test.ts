import type {ProxyContext} from './types'

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import process from 'node:process'
import {afterEach, describe, expect, it} from 'vitest'
import {defineProxy} from './index'
import {loadProxyModule, resolvePublicPathModule} from './runtime-core'

const tempDirs: string[] = []

function createTempDir(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-script-runtime-'))
  tempDirs.push(tempDir)
  return tempDir
}

function createContext(tempDir: string, command: ProxyContext['command'] = 'install'): ProxyContext {
  const workspaceDir = path.join(tempDir, 'workspace')
  const aindexDir = path.join(workspaceDir, 'aindex')
  fs.mkdirSync(path.join(aindexDir, 'public'), {recursive: true})

  return {
    cwd: workspaceDir,
    workspaceDir,
    aindexDir,
    command,
    platform: process.platform
  }
}

function writeProxyFile(tempDir: string, source: string): string {
  const filePath = path.join(tempDir, 'workspace', 'aindex', 'public', 'proxy.ts')
  fs.mkdirSync(path.dirname(filePath), {recursive: true})
  fs.writeFileSync(filePath, source, 'utf8')
  return filePath
}

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) fs.rmSync(tempDir, {recursive: true, force: true})
})

describe('runtime-core', () => {
  it('loads object default exports', async () => {
    const tempDir = createTempDir()
    const ctx = createContext(tempDir)
    const filePath = writeProxyFile(
      tempDir,
      'export default { resolvePublicPath(logicalPath) { return logicalPath.replace(/^\\.git\\//, "____git/") } }\n'
    )

    const loadedModule = await loadProxyModule(filePath)
    const result = await resolvePublicPathModule(filePath, ctx, '.git/info/exclude')

    expect(loadedModule.default).toBeDefined()
    expect(result).toBe('____git/info/exclude')
  })

  it('loads async function exports', async () => {
    const tempDir = createTempDir()
    const ctx = createContext(tempDir, 'dry-run')
    const filePath = writeProxyFile(
      tempDir,
      'export default async (logicalPath, ctx) => ctx.command === "dry-run" ? "dry/" + logicalPath : logicalPath\n'
    )

    const result = await resolvePublicPathModule(filePath, ctx, '.vscode/settings.json')

    expect(result).toBe('dry/.vscode/settings.json')
  })

  it('skips unmatched commands', async () => {
    const tempDir = createTempDir()
    const ctx = createContext(tempDir, 'clean')
    const filePath = writeProxyFile(
      tempDir,
      'export const config = { matcher: { commands: ["install"] } }\nexport default (logicalPath) => "shadow/" + logicalPath\n'
    )

    const result = await resolvePublicPathModule(filePath, ctx, '.editorconfig')

    expect(filePath.endsWith('proxy.ts')).toBe(true)
    expect(result).toBe('.editorconfig')
  })

  it('rejects non-string path results', async () => {
    const tempDir = createTempDir()
    const ctx = createContext(tempDir)
    const filePath = writeProxyFile(tempDir, 'export default () => ({ bad: true })\n')

    await expect(resolvePublicPathModule(filePath, ctx, '.gitignore'))
      .rejects
      .toThrow('proxy.ts must resolve public paths to a string')
  })

  it('exposes defineProxy as identity', () => {
    const proxy = defineProxy({
      resolvePublicPath(logicalPath: string) {
        return logicalPath
      }
    })

    expect(proxy.resolvePublicPath?.('.gitignore', createContext(createTempDir()))).toBe('.gitignore')
  })
})
