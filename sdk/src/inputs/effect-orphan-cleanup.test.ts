import type {InputCapabilityContext} from '../adaptors/adaptor-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import glob from 'fast-glob'
import {describe, expect, it} from 'vitest'
import {createLogger} from '../adaptors/adaptor-core'
import {mergeConfig} from '../config'
import {OrphanFileCleanupEffectInputCapability} from './effect-orphan-cleanup'

const legacySourceExtension = '.cn.mdx'

function createContext(tempWorkspace: string): InputCapabilityContext {
  const options = mergeConfig({workspaceDir: tempWorkspace})

  return {
    logger: createLogger('OrphanFileCleanupEffectInputCapabilityTest', 'error'),
    fs,
    path,
    glob,
    userConfigOptions: options,
    dependencyContext: {}
  } as InputCapabilityContext
}

class TestOrphanFileCleanupEffectInputCapability extends OrphanFileCleanupEffectInputCapability {
  constructor(private readonly planFactory: (ctx: ReturnType<OrphanFileCleanupEffectInputCapability['resolveBasePaths']> & {readonly fs: typeof fs, readonly path: typeof path}) => {
    filesToDelete: string[]
    dirsToDelete: string[]
    errors: {path: string, error: Error}[]
  }) {
    super()
  }

  protected override buildDeletionPlan(ctx: Parameters<OrphanFileCleanupEffectInputCapability['buildDeletionPlan']>[0]): {
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

      const plugin = new OrphanFileCleanupEffectInputCapability()
      const [result] = await plugin.executeEffects(createContext(tempWorkspace))

      expect(result?.success).toBe(true)
      expect(fs.existsSync(distFile)).toBe(true)
      expect(result?.deletedFiles ?? []).toHaveLength(0)
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('deletes dist command mdx files when only a legacy cn source remains', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-orphan-cleanup-legacy-test-'))
    const srcDir = path.join(tempWorkspace, 'aindex', 'commands')
    const distDir = path.join(tempWorkspace, 'aindex', 'dist', 'commands')
    const distFile = path.join(distDir, 'demo.mdx')

    try {
      fs.mkdirSync(srcDir, {recursive: true})
      fs.mkdirSync(distDir, {recursive: true})
      fs.writeFileSync(path.join(srcDir, `demo${legacySourceExtension}`), '---\ndescription: legacy\n---\nLegacy prompt', 'utf8')
      fs.writeFileSync(distFile, 'Compiled prompt', 'utf8')

      const plugin = new OrphanFileCleanupEffectInputCapability()
      const [result] = await plugin.executeEffects(createContext(tempWorkspace))

      expect(result?.success).toBe(true)
      expect(fs.existsSync(distFile)).toBe(false)
      expect(result?.deletedDirs ?? []).toContain(path.join(tempWorkspace, 'aindex', 'dist', 'commands'))
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

      const plugin = new TestOrphanFileCleanupEffectInputCapability(() => ({
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

  it('allows deleting files inside the aindex tree while still using root-level protection', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-orphan-cleanup-guard-subtree-'))
    const srcDir = path.join(tempWorkspace, 'aindex', 'commands')
    const protectedSourceFile = path.join(srcDir, 'demo.src.mdx')
    const safeDistFile = path.join(tempWorkspace, 'aindex', 'dist', 'commands', 'safe.mdx')

    try {
      fs.mkdirSync(srcDir, {recursive: true})
      fs.mkdirSync(path.dirname(safeDistFile), {recursive: true})
      fs.writeFileSync(protectedSourceFile, '---\ndescription: source\n---\nSource prompt', 'utf8')
      fs.writeFileSync(safeDistFile, 'Compiled prompt', 'utf8')

      const plugin = new TestOrphanFileCleanupEffectInputCapability(() => ({
        filesToDelete: [safeDistFile, protectedSourceFile],
        dirsToDelete: [],
        errors: []
      }))

      const [result] = await plugin.executeEffects(createContext(tempWorkspace))
      expect(result?.success).toBe(true)
      expect(fs.existsSync(safeDistFile)).toBe(false)
      expect(fs.existsSync(protectedSourceFile)).toBe(false)
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('collapses nested orphan directories to the highest removable subtree root', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-orphan-cleanup-collapse-test-'))
    const distDir = path.join(tempWorkspace, 'aindex', 'dist', 'commands', 'legacy', 'deep')
    const orphanFile = path.join(distDir, 'demo.txt')

    try {
      fs.mkdirSync(distDir, {recursive: true})
      fs.writeFileSync(orphanFile, 'Compiled prompt', 'utf8')

      const plugin = new OrphanFileCleanupEffectInputCapability()
      const [result] = await plugin.executeEffects(createContext(tempWorkspace))

      expect(result?.success).toBe(true)
      expect(result?.deletedFiles).toEqual([])
      expect(result?.deletedDirs).toEqual([path.join(tempWorkspace, 'aindex', 'dist', 'commands')])
      expect(fs.existsSync(path.join(tempWorkspace, 'aindex', 'dist', 'commands'))).toBe(false)
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('cleans orphaned ext and arch dist files using matching series source roots', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-orphan-cleanup-series-'))
    const extSrcFile = path.join(tempWorkspace, 'aindex', 'ext', 'plugin-a', 'agt.src.mdx')
    const extDistFile = path.join(tempWorkspace, 'aindex', 'dist', 'ext', 'plugin-a', 'agt.mdx')
    const archDistFile = path.join(tempWorkspace, 'aindex', 'dist', 'arch', 'system-a', 'agt.mdx')

    try {
      fs.mkdirSync(path.dirname(extSrcFile), {recursive: true})
      fs.mkdirSync(path.dirname(extDistFile), {recursive: true})
      fs.mkdirSync(path.dirname(archDistFile), {recursive: true})
      fs.writeFileSync(extSrcFile, '---\ndescription: ext\n---\nExt prompt', 'utf8')
      fs.writeFileSync(extDistFile, 'Ext dist', 'utf8')
      fs.writeFileSync(archDistFile, 'Arch dist', 'utf8')

      const plugin = new OrphanFileCleanupEffectInputCapability()
      const [result] = await plugin.executeEffects(createContext(tempWorkspace))

      expect(result?.success).toBe(true)
      expect(fs.existsSync(extDistFile)).toBe(true)
      expect(fs.existsSync(archDistFile)).toBe(false)
      expect(result?.deletedDirs ?? []).toContain(path.join(tempWorkspace, 'aindex', 'dist', 'arch'))
      expect(result?.deletedFiles ?? []).not.toContain(extDistFile)
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('cleans orphaned softwares dist files using the matching software source root', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-orphan-cleanup-softwares-'))
    const softwareSrcFile = path.join(tempWorkspace, 'aindex', 'softwares', 'tool-a', 'agt.src.mdx')
    const softwareDistFile = path.join(tempWorkspace, 'aindex', 'dist', 'softwares', 'tool-a', 'agt.mdx')
    const orphanSoftwareDistFile = path.join(tempWorkspace, 'aindex', 'dist', 'softwares', 'tool-b', 'agt.mdx')

    try {
      fs.mkdirSync(path.dirname(softwareSrcFile), {recursive: true})
      fs.mkdirSync(path.dirname(softwareDistFile), {recursive: true})
      fs.mkdirSync(path.dirname(orphanSoftwareDistFile), {recursive: true})
      fs.writeFileSync(softwareSrcFile, '---\ndescription: software\n---\nSoftware prompt', 'utf8')
      fs.writeFileSync(softwareDistFile, 'Software dist', 'utf8')
      fs.writeFileSync(orphanSoftwareDistFile, 'Orphan software dist', 'utf8')

      const plugin = new OrphanFileCleanupEffectInputCapability()
      const [result] = await plugin.executeEffects(createContext(tempWorkspace))

      expect(result?.success).toBe(true)
      expect(fs.existsSync(softwareDistFile)).toBe(true)
      expect(fs.existsSync(orphanSoftwareDistFile)).toBe(false)
      expect(result?.deletedDirs ?? []).toContain(path.dirname(orphanSoftwareDistFile))
      expect(result?.deletedFiles ?? []).not.toContain(softwareDistFile)
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('cleans orphaned subagent dist files using the configured subagents source root', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-orphan-cleanup-subagents-'))
    const subAgentSrcFile = path.join(tempWorkspace, 'aindex', 'subagents', 'qa', 'boot.src.mdx')
    const subAgentDistFile = path.join(tempWorkspace, 'aindex', 'dist', 'subagents', 'qa', 'boot.mdx')
    const orphanSubAgentDistFile = path.join(tempWorkspace, 'aindex', 'dist', 'subagents', 'ops', 'boot.mdx')

    try {
      fs.mkdirSync(path.dirname(subAgentSrcFile), {recursive: true})
      fs.mkdirSync(path.dirname(subAgentDistFile), {recursive: true})
      fs.mkdirSync(path.dirname(orphanSubAgentDistFile), {recursive: true})
      fs.writeFileSync(subAgentSrcFile, '---\ndescription: subagent\n---\nSubagent prompt', 'utf8')
      fs.writeFileSync(subAgentDistFile, 'Subagent dist', 'utf8')
      fs.writeFileSync(orphanSubAgentDistFile, 'Orphan subagent dist', 'utf8')

      const plugin = new OrphanFileCleanupEffectInputCapability()
      const [result] = await plugin.executeEffects(createContext(tempWorkspace))

      expect(result?.success).toBe(true)
      expect(fs.existsSync(subAgentDistFile)).toBe(true)
      expect(fs.existsSync(orphanSubAgentDistFile)).toBe(false)
      expect(result?.deletedDirs ?? []).toContain(path.dirname(orphanSubAgentDistFile))
      expect(result?.deletedFiles ?? []).not.toContain(subAgentDistFile)
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })
})
