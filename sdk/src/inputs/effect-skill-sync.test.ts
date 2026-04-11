import type {AdaptorOptions, InputCapabilityContext} from '../adaptors/adaptor-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import glob from 'fast-glob'
import {describe, expect, it} from 'vitest'
import {createLogger} from '../adaptors/adaptor-core'
import {mergeConfig} from '../config'
import {SkillDistCleanupEffectInputCapability} from './effect-skill-sync'

function createContext(
  tempWorkspace: string,
  overrides?: Partial<AdaptorOptions>
): InputCapabilityContext {
  const options = mergeConfig({workspaceDir: tempWorkspace}, overrides ?? {})

  return {
    logger: createLogger('SkillDistCleanupEffectInputCapabilityTest', 'error'),
    fs,
    path,
    glob,
    userConfigOptions: options,
    dependencyContext: {}
  } as InputCapabilityContext
}

describe('skill dist cleanup effect', () => {
  it('deletes non-mdx mirrored files while preserving compiled mdx files', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-skill-dist-cleanup-test-'))
    const distSkillDir = path.join(tempWorkspace, 'aindex', 'dist', 'skills', 'demo')
    const nestedLegacyDir = path.join(distSkillDir, 'legacy')

    try {
      fs.mkdirSync(nestedLegacyDir, {recursive: true})
      fs.writeFileSync(path.join(distSkillDir, 'skill.mdx'), 'Compiled skill', 'utf8')
      fs.writeFileSync(path.join(distSkillDir, 'guide.mdx'), 'Compiled guide', 'utf8')
      fs.writeFileSync(path.join(distSkillDir, 'guide.src.mdx'), 'Stale source mirror', 'utf8')
      fs.writeFileSync(path.join(distSkillDir, 'notes.md'), 'Legacy note', 'utf8')
      fs.writeFileSync(path.join(distSkillDir, 'demo.kts'), 'println("legacy")', 'utf8')
      fs.writeFileSync(path.join(distSkillDir, 'mcp.json'), '{"mcpServers":{}}', 'utf8')
      fs.writeFileSync(path.join(nestedLegacyDir, 'diagram.svg'), '<svg />', 'utf8')

      const plugin = new SkillDistCleanupEffectInputCapability()
      const [result] = await plugin.executeEffects(createContext(tempWorkspace))

      expect(result?.success).toBe(true)
      expect(fs.existsSync(path.join(distSkillDir, 'skill.mdx'))).toBe(true)
      expect(fs.existsSync(path.join(distSkillDir, 'guide.mdx'))).toBe(true)
      expect(fs.existsSync(path.join(distSkillDir, 'guide.src.mdx'))).toBe(false)
      expect(fs.existsSync(path.join(distSkillDir, 'notes.md'))).toBe(false)
      expect(fs.existsSync(path.join(distSkillDir, 'demo.kts'))).toBe(false)
      expect(fs.existsSync(path.join(distSkillDir, 'mcp.json'))).toBe(false)
      expect(fs.existsSync(path.join(nestedLegacyDir, 'diagram.svg'))).toBe(false)
      expect(fs.existsSync(nestedLegacyDir)).toBe(false)
      expect(result?.deletedFiles).toEqual(expect.arrayContaining([
        path.join(distSkillDir, 'guide.src.mdx'),
        path.join(distSkillDir, 'notes.md'),
        path.join(distSkillDir, 'demo.kts'),
        path.join(distSkillDir, 'mcp.json')
      ]))
      expect(result?.deletedDirs).toContain(nestedLegacyDir)
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('respects configured skills dist paths instead of hardcoded defaults', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-skill-dist-cleanup-config-test-'))
    const distSkillDir = path.join(tempWorkspace, 'aindex', 'compiled', 'skills', 'demo')

    try {
      fs.mkdirSync(distSkillDir, {recursive: true})
      fs.writeFileSync(path.join(distSkillDir, 'skill.mdx'), 'Compiled skill', 'utf8')
      fs.writeFileSync(path.join(distSkillDir, 'legacy.txt'), 'Legacy attachment', 'utf8')

      const plugin = new SkillDistCleanupEffectInputCapability()
      const [result] = await plugin.executeEffects(createContext(tempWorkspace, {
        aindex: {
          skills: {src: 'abilities', dist: 'compiled/skills'}
        }
      }))

      expect(result?.success).toBe(true)
      expect(fs.existsSync(path.join(distSkillDir, 'skill.mdx'))).toBe(true)
      expect(fs.existsSync(path.join(distSkillDir, 'legacy.txt'))).toBe(false)
      expect(result?.deletedFiles).toContain(path.join(distSkillDir, 'legacy.txt'))
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('collapses nested removable skill dist directories to the highest safe root', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-skill-dist-cleanup-collapse-test-'))
    const distSkillDir = path.join(tempWorkspace, 'aindex', 'dist', 'skills', 'demo')
    const nestedLegacyDir = path.join(distSkillDir, 'legacy', 'deep')

    try {
      fs.mkdirSync(nestedLegacyDir, {recursive: true})
      fs.writeFileSync(path.join(nestedLegacyDir, 'diagram.svg'), '<svg />', 'utf8')

      const plugin = new SkillDistCleanupEffectInputCapability()
      const [result] = await plugin.executeEffects(createContext(tempWorkspace))

      expect(result?.success).toBe(true)
      expect(result?.deletedFiles).toEqual([])
      expect(result?.deletedDirs).toEqual([path.join(tempWorkspace, 'aindex', 'dist', 'skills')])
      expect(fs.existsSync(path.join(tempWorkspace, 'aindex', 'dist', 'skills'))).toBe(false)
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })
})
