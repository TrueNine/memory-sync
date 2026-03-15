import type {ILogger, InputPluginContext} from '../plugins/plugin-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import glob from 'fast-glob'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {mergeConfig} from '../config'

vi.mock('@truenine/md-compiler', () => ({
  mdxToMd: async (content: string) => ({
    content: content.replace(/export default\s*\{[\s\S]*?\}\s*/u, '').trim(),
    metadata: {
      fields: {},
      source: 'export'
    }
  })
}))

function createMockLogger(): ILogger {
  return {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {}
  } as ILogger
}

function createContext(tempWorkspace: string, logger: ILogger): InputPluginContext {
  const options = mergeConfig({workspaceDir: tempWorkspace})

  return {
    logger,
    fs,
    path,
    glob,
    userConfigOptions: options,
    dependencyContext: {}
  } as InputPluginContext
}

afterEach(() => vi.resetModules())

describe('skill input plugin export fallback', () => {
  it('uses export-default metadata when compiled metadata fields are empty', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-skill-export-fallback-'))
    const srcSkillDir = path.join(tempWorkspace, 'aindex', 'skills', 'demo')
    const distSkillDir = path.join(tempWorkspace, 'aindex', 'dist', 'skills', 'demo')

    try {
      fs.mkdirSync(srcSkillDir, {recursive: true})
      fs.mkdirSync(distSkillDir, {recursive: true})
      fs.writeFileSync(path.join(srcSkillDir, 'skill.src.mdx'), `export default {
  name: 'demo',
  description: 'source export description',
}

Source skill
`, 'utf8')
      fs.writeFileSync(path.join(distSkillDir, 'skill.mdx'), `export default {
  name: 'demo',
  description: 'dist export description',
}

Dist skill
`, 'utf8')

      const {SkillInputPlugin} = await import('./input-agentskills')
      const plugin = new SkillInputPlugin()
      const result = await plugin.collect(createContext(tempWorkspace, createMockLogger()))
      const [skill] = result.skills ?? []

      expect(result.skills?.length ?? 0).toBe(1)
      expect(skill?.yamlFrontMatter?.description).toBe('dist export description')
      expect(skill?.content).toContain('Dist skill')
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })
})
