import type {InputPluginContext} from '../plugins/plugin-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import glob from 'fast-glob'
import {describe, expect, it} from 'vitest'
import {mergeConfig} from '../config'
import {createLogger} from '../plugins/plugin-core'
import {OrphanFileCleanupEffectInputPlugin} from './effect-orphan-cleanup'

const legacySourceExtension = '.cn.mdx'

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

class TestOrphanFileCleanupEffectInputPlugin extends OrphanFileCleanupEffectInputPlugin {
  constructor(private readonly planFactory: (ctx: ReturnType<OrphanFileCleanupEffectInputPlugin['resolveBasePaths']> & {readonly fs: typeof fs, readonly path: typeof path}) => {
    filesToDelete: string[]
    dirsToDelete: string[]
    errors: {path: string, error: Error}[]
  }) {
    super()
  }

  protected override buildDeletionPlan(ctx: Parameters<OrphanFileCleanupEffectInputPlugin['buildDeletionPlan']>[0]): {
    filesToDelete: string[]
    dirsToDelete: string[]
    errors: {path: string, error: Error}[]
  } {
    const basePaths = this.resolveBasePaths(ctx.userConfigOptions)
    return this.planFactory({...basePaths, fs: ctx.fs, path: ctx.path})
  }
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

  it('fails when an orphan cleanup candidate hits an exact protected path', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-orphan-cleanup-guard-exact-'))
    const safeDistFile = path.join(tempWorkspace, 'aindex', 'dist', 'commands', 'safe.mdx')
    const globalConfigPath = path.join(os.homedir(), '.aindex', '.tnmsc.json')

    try {
      fs.mkdirSync(path.dirname(safeDistFile), {recursive: true})
      fs.writeFileSync(safeDistFile, 'Compiled prompt', 'utf8')

      const plugin = new TestOrphanFileCleanupEffectInputPlugin(() => ({
        filesToDelete: [safeDistFile, globalConfigPath],
        dirsToDelete: [],
        errors: []
      }))

      await expect(plugin.executeEffects(createContext(tempWorkspace))).rejects.toThrow('Protected deletion guard blocked orphan-file-cleanup')
      expect(fs.existsSync(safeDistFile)).toBe(true)
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('fails without partial deletion when safe and subtree-protected candidates are mixed', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-orphan-cleanup-guard-subtree-'))
    const srcDir = path.join(tempWorkspace, 'aindex', 'commands')
    const protectedSourceFile = path.join(srcDir, 'demo.src.mdx')
    const safeDistFile = path.join(tempWorkspace, 'aindex', 'dist', 'commands', 'safe.mdx')

    try {
      fs.mkdirSync(srcDir, {recursive: true})
      fs.mkdirSync(path.dirname(safeDistFile), {recursive: true})
      fs.writeFileSync(protectedSourceFile, '---\ndescription: source\n---\nSource prompt', 'utf8')
      fs.writeFileSync(safeDistFile, 'Compiled prompt', 'utf8')

      const plugin = new TestOrphanFileCleanupEffectInputPlugin(() => ({
        filesToDelete: [safeDistFile, protectedSourceFile],
        dirsToDelete: [],
        errors: []
      }))

      await expect(plugin.executeEffects(createContext(tempWorkspace))).rejects.toThrow('Protected deletion guard blocked orphan-file-cleanup')
      expect(fs.existsSync(safeDistFile)).toBe(true)
      expect(fs.existsSync(protectedSourceFile)).toBe(true)
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })
})
