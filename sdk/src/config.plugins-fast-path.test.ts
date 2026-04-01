import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {defineConfig} from './config'

const {collectInputContextMock} = vi.hoisted(() => ({
  collectInputContextMock: vi.fn(async () => {
    throw new Error('collectInputContext should not run for plugins fast path')
  })
}))

vi.mock('./inputs/runtime', async importOriginal => {
  const actual = await importOriginal<typeof import('./inputs/runtime')>()

  return {
    ...actual,
    collectInputContext: collectInputContextMock
  }
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('defineConfig plugins fast path', () => {
  it('skips input collection for plugins runtime commands', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-plugins-fast-path-'))

    try {
      const result = await defineConfig({
        loadUserConfig: false,
        runtimeCommand: 'plugins',
        pluginOptions: {
          workspaceDir: tempWorkspace,
          plugins: []
        }
      })

      expect(collectInputContextMock).not.toHaveBeenCalled()
      expect(result.context.workspace.directory.path).toBe(tempWorkspace)
      expect(result.context.aindexDir).toBe(path.join(tempWorkspace, 'aindex'))
      expect(result.outputPlugins).toEqual([])
    } finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })
})
