import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'

import {resolvePublicPath} from './index'

const tempDirs: string[] = []

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    rmSync(tempDir, {recursive: true, force: true})
  }
})

describe('script runtime worker resolution', () => {
  it('resolves a proxy path through the native worker bridge', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'tnmsc-script-runtime-'))
    tempDirs.push(tempDir)

    const proxyModulePath = join(tempDir, 'proxy.ts')

    writeFileSync(
      proxyModulePath,
      'export default { resolvePublicPath(logicalPath) { return logicalPath.replace(/^\\.git\\//u, "____git/") } }\n',
      'utf8'
    )

    const result = resolvePublicPath(proxyModulePath, {
      cwd: tempDir,
      workspaceDir: tempDir,
      aindexDir: join(tempDir, '.aindex'),
      command: 'install',
      platform: process.platform
    }, '.git/config')

    expect(result).toBe('____git/config')
  })
})
