import type {InputPluginContext} from '../plugins/plugin-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import glob from 'fast-glob'
import {describe, expect, it} from 'vitest'
import {mergeConfig} from '../config'
import {createLogger} from '../plugins/plugin-core'
import {SkillNonSrcFileSyncEffectInputPlugin} from './effect-skill-sync'

const legacySourceExtension = '.cn.mdx'

function createContext(tempWorkspace: string): InputPluginContext {
  const options = mergeConfig({workspaceDir: tempWorkspace})

  return {
    logger: createLogger('SkillNonSrcFileSyncEffectInputPluginTest', 'error'),
    fs,
    path,
    glob,
    userConfigOptions: options,
    dependencyContext: {}
  } as InputPluginContext
}

describe('skill non-src file sync effect', () => {
  it('skips .src.mdx files while copying non-source skill assets', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-skill-sync-test-'))
    const srcSkillDir = path.join(tempWorkspace, 'aindex', 'src', 'skills', 'demo')
    const distSkillDir = path.join(tempWorkspace, 'aindex', 'dist', 'skills', 'demo')

    try {
      fs.mkdirSync(srcSkillDir, {recursive: true})
      fs.writeFileSync(path.join(srcSkillDir, 'skill.src.mdx'), '---\ndescription: demo\n---\nDemo skill', 'utf8')
      fs.writeFileSync(path.join(srcSkillDir, 'guide.src.mdx'), 'Guide child doc', 'utf8')
      fs.writeFileSync(path.join(srcSkillDir, `legacy${legacySourceExtension}`), 'Legacy child doc', 'utf8')
      fs.writeFileSync(path.join(srcSkillDir, 'guide.mdx'), 'English child doc', 'utf8')
      fs.writeFileSync(path.join(srcSkillDir, 'notes.md'), 'Skill notes', 'utf8')

      const plugin = new SkillNonSrcFileSyncEffectInputPlugin()
      const [result] = await plugin.executeEffects(createContext(tempWorkspace))

      expect(result?.success).toBe(true)
      expect(fs.existsSync(path.join(distSkillDir, 'notes.md'))).toBe(true)
      expect(fs.existsSync(path.join(distSkillDir, 'skill.src.mdx'))).toBe(false)
      expect(fs.existsSync(path.join(distSkillDir, 'guide.src.mdx'))).toBe(false)
      expect(fs.existsSync(path.join(distSkillDir, `legacy${legacySourceExtension}`))).toBe(false)
      expect(fs.existsSync(path.join(distSkillDir, 'guide.mdx'))).toBe(false)
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })
})
