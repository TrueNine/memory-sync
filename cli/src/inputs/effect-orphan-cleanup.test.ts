import type {InputPluginContext} from '../plugins/plugin-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import glob from 'fast-glob'
import {describe, expect, it} from 'vitest'
import {mergeConfig} from '../config'
import {createLogger} from '../plugins/plugin-core'
import {OrphanFileCleanupEffectInputPlugin} from './effect-orphan-cleanup'

const legacySourceExtension = '.cn' + '.mdx'

function createContext(tempWorkspace: string): InputPluginContext {
  const options = mergeConfig({workspaceDir: tempWorkspace})

  return {
    logger: createLogger('OrphanFileCleanupEffectInputPluginTest', 'error'),
    fs,
    path,
    glob,
    userConfigOptions: options,
    dependencyContext: {}
  } as InputPluginContext
}

describe('orphan file cleanup effect', () => {
  it('keeps dist command files when a matching .src.mdx source exists', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-orphan-cleanup-test-'))
    const srcDir = path.join(tempWorkspace, 'aindex', 'commands')
    const distDir = path.join(tempWorkspace, 'aindex', 'dist', 'commands')
    const distFile = path.join(distDir, 'demo.mdx')

    try {
      fs.mkdirSync(srcDir, {recursive: true})
      fs.mkdirSync(distDir, {recursive: true})
      fs.writeFileSync(path.join(srcDir, 'demo.src.mdx'), '---\ndescription: source\n---\nSource prompt', 'utf8')
      fs.writeFileSync(distFile, 'Compiled prompt', 'utf8')

      const plugin = new OrphanFileCleanupEffectInputPlugin()
      const [result] = await plugin.executeEffects(createContext(tempWorkspace))

      expect(result?.success).toBe(true)
      expect(fs.existsSync(distFile)).toBe(true)
      expect(result?.deletedFiles ?? []).toHaveLength(0)
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('deletes dist command files when only a legacy cn source remains', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-orphan-cleanup-legacy-test-'))
    const srcDir = path.join(tempWorkspace, 'aindex', 'commands')
    const distDir = path.join(tempWorkspace, 'aindex', 'dist', 'commands')
    const distFile = path.join(distDir, 'demo.mdx')

    try {
      fs.mkdirSync(srcDir, {recursive: true})
      fs.mkdirSync(distDir, {recursive: true})
      fs.writeFileSync(path.join(srcDir, `demo${legacySourceExtension}`), '---\ndescription: legacy\n---\nLegacy prompt', 'utf8')
      fs.writeFileSync(distFile, 'Compiled prompt', 'utf8')

      const plugin = new OrphanFileCleanupEffectInputPlugin()
      const [result] = await plugin.executeEffects(createContext(tempWorkspace))

      expect(result?.success).toBe(true)
      expect(fs.existsSync(distFile)).toBe(false)
      expect(result?.deletedFiles ?? []).toContain(distFile)
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })
})
