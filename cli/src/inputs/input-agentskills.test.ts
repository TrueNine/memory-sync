import type {ILogger, InputCapabilityContext} from '../plugins/plugin-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import glob from 'fast-glob'
import {describe, expect, it} from 'vitest'
import {mergeConfig} from '../config'
import {SkillInputCapability} from './input-agentskills'

function createMockLogger(warnings: string[] = [], errors: string[] = []): ILogger {
  return {
    trace: () => {},
    debug: () => {},
    info: () => {},
    warn: diagnostic => warnings.push(diagnostic.code),
    error: diagnostic => errors.push(diagnostic.code),
    fatal: diagnostic => errors.push(diagnostic.code)
  } as ILogger
}

function createContext(tempWorkspace: string, logger: ILogger): InputCapabilityContext {
  const options = mergeConfig({workspaceDir: tempWorkspace})

  return {
    logger,
    fs,
    path,
    glob,
    userConfigOptions: options,
    dependencyContext: {}
  } as InputCapabilityContext
}

describe('skill input plugin', () => {
  it('reads compiled mdx from dist and non-mdx resources from src', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-skill-input-test-'))
    const srcSkillDir = path.join(tempWorkspace, 'aindex', 'skills', 'demo')
    const distSkillDir = path.join(tempWorkspace, 'aindex', 'dist', 'skills', 'demo')

    try {
      fs.mkdirSync(srcSkillDir, {recursive: true})
      fs.mkdirSync(distSkillDir, {recursive: true})
      fs.writeFileSync(path.join(srcSkillDir, 'skill.src.mdx'), '---\ndescription: src skill\n---\nSkill source', 'utf8')
      fs.writeFileSync(path.join(srcSkillDir, 'guide.src.mdx'), '---\ndescription: src guide\n---\nGuide source', 'utf8')
      fs.writeFileSync(path.join(srcSkillDir, 'notes.md'), 'Source notes', 'utf8')
      fs.writeFileSync(path.join(srcSkillDir, 'demo.kts'), 'println("source")', 'utf8')
      fs.writeFileSync(path.join(srcSkillDir, 'mcp.json'), '{"mcpServers":{"demo":{"command":"demo"}}}', 'utf8')
      fs.writeFileSync(path.join(distSkillDir, 'skill.mdx'), '---\ndescription: dist skill\n---\nexport const x = 1\n\nSkill dist', 'utf8')
      fs.writeFileSync(path.join(distSkillDir, 'guide.mdx'), '---\ndescription: dist guide\n---\nGuide dist', 'utf8')

      const plugin = new SkillInputCapability()
      const result = await plugin.collect(createContext(tempWorkspace, createMockLogger()))
      const [skill] = result.skills ?? []

      expect(result.skills?.length ?? 0).toBe(1)
      expect(skill?.content).toContain('Skill dist')
      expect(skill?.content).not.toContain('Skill source')
      expect(skill?.content).not.toContain('export const x = 1')
      expect(skill?.yamlFrontMatter?.description).toBe('dist skill')
      expect(skill?.childDocs?.map(childDoc => childDoc.relativePath)).toEqual(['guide.mdx'])
      expect(skill?.childDocs?.[0]?.content).toContain('Guide dist')
      expect(skill?.childDocs?.[0]?.content).not.toContain('Guide source')
      expect(new Set(skill?.resources?.map(resource => resource.relativePath) ?? [])).toEqual(new Set(['demo.kts', 'notes.md']))
      expect(skill?.resources?.find(resource => resource.relativePath === 'notes.md')?.content).toBe('Source notes')
      expect(skill?.resources?.find(resource => resource.relativePath === 'demo.kts')?.content).toContain('println("source")')
      expect(skill?.mcpConfig?.mcpServers.demo?.command).toBe('demo')
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('uses src resources even when a legacy dist copy still exists', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-skill-input-resource-test-'))
    const srcSkillDir = path.join(tempWorkspace, 'aindex', 'skills', 'demo')
    const distSkillDir = path.join(tempWorkspace, 'aindex', 'dist', 'skills', 'demo')

    try {
      fs.mkdirSync(srcSkillDir, {recursive: true})
      fs.mkdirSync(distSkillDir, {recursive: true})
      fs.writeFileSync(path.join(srcSkillDir, 'skill.src.mdx'), '---\ndescription: src skill\n---\nSkill source', 'utf8')
      fs.writeFileSync(path.join(srcSkillDir, 'notes.md'), 'Source notes', 'utf8')
      fs.writeFileSync(path.join(distSkillDir, 'skill.mdx'), '---\ndescription: dist skill\n---\nSkill dist', 'utf8')
      fs.writeFileSync(path.join(distSkillDir, 'notes.md'), 'Legacy dist notes', 'utf8')

      const plugin = new SkillInputCapability()
      const result = await plugin.collect(createContext(tempWorkspace, createMockLogger()))
      const [skill] = result.skills ?? []

      expect(skill?.resources?.find(resource => resource.relativePath === 'notes.md')?.content).toBe('Source notes')
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('fails hard when child docs are missing compiled dist pairs', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-skill-input-missing-child-test-'))
    const srcSkillDir = path.join(tempWorkspace, 'aindex', 'skills', 'demo')
    const distSkillDir = path.join(tempWorkspace, 'aindex', 'dist', 'skills', 'demo')

    try {
      fs.mkdirSync(srcSkillDir, {recursive: true})
      fs.mkdirSync(distSkillDir, {recursive: true})
      fs.writeFileSync(path.join(srcSkillDir, 'skill.src.mdx'), '---\ndescription: src skill\n---\nSkill source', 'utf8')
      fs.writeFileSync(path.join(srcSkillDir, 'guide.src.mdx'), '---\ndescription: src guide\n---\nGuide source', 'utf8')
      fs.writeFileSync(path.join(distSkillDir, 'skill.mdx'), '---\ndescription: dist skill\n---\nSkill dist', 'utf8')

      const plugin = new SkillInputCapability()
      await expect(plugin.collect(createContext(tempWorkspace, createMockLogger()))).rejects.toThrow('Missing compiled dist prompt')
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('fails hard when the main skill exists only in src', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-skill-input-main-missing-dist-test-'))
    const srcSkillDir = path.join(tempWorkspace, 'aindex', 'skills', 'demo')

    try {
      fs.mkdirSync(srcSkillDir, {recursive: true})
      fs.writeFileSync(path.join(srcSkillDir, 'skill.src.mdx'), '---\ndescription: src only skill\n---\nSkill source', 'utf8')

      const plugin = new SkillInputCapability()
      await expect(plugin.collect(createContext(tempWorkspace, createMockLogger()))).rejects.toThrow('Missing compiled dist prompt')
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('rejects workspace as an unsupported skill scope', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-skill-input-workspace-scope-test-'))
    const srcSkillDir = path.join(tempWorkspace, 'aindex', 'skills', 'demo')
    const distSkillDir = path.join(tempWorkspace, 'aindex', 'dist', 'skills', 'demo')

    try {
      fs.mkdirSync(srcSkillDir, {recursive: true})
      fs.mkdirSync(distSkillDir, {recursive: true})
      fs.writeFileSync(path.join(srcSkillDir, 'skill.src.mdx'), '---\ndescription: src skill\n---\nSkill source', 'utf8')
      fs.writeFileSync(path.join(distSkillDir, 'skill.mdx'), '---\nname: demo\ndescription: dist skill\nscope: workspace\n---\nSkill dist', 'utf8')

      const plugin = new SkillInputCapability()
      await expect(plugin.collect(createContext(tempWorkspace, createMockLogger()))).rejects.toThrow('Field "scope" must be "project" or "global"')
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })
})
