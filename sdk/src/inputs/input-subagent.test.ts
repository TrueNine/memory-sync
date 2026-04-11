import type {InputCapabilityContext} from '../adaptors/adaptor-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import glob from 'fast-glob'
import {describe, expect, it} from 'vitest'
import {createLogger} from '../adaptors/adaptor-core'
import {mergeConfig} from '../config'
import {SubAgentInputCapability} from './input-subagent'

function createContext(tempWorkspace: string): InputCapabilityContext {
  const options = mergeConfig({workspaceDir: tempWorkspace})

  return {
    logger: createLogger('SubAgentInputCapabilityTest', 'error'),
    fs,
    path,
    glob,
    userConfigOptions: options,
    dependencyContext: {}
  } as InputCapabilityContext
}

describe('subagent input plugin', () => {
  it('prefers dist content, and dist also runs mdx-to-md compilation', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-subagent-test-'))
    const aindexDir = path.join(tempWorkspace, 'aindex')
    const srcDir = path.join(aindexDir, 'subagents')
    const distDir = path.join(aindexDir, 'dist', 'subagents')

    try {
      fs.mkdirSync(srcDir, {recursive: true})
      fs.mkdirSync(distDir, {recursive: true})

      const srcFile = path.join(srcDir, 'demo.src.mdx')
      const distFile = path.join(distDir, 'demo.mdx')
      fs.writeFileSync(srcFile, '---\ndescription: src\n---\nSubAgent source', 'utf8')
      fs.writeFileSync(distFile, '---\ndescription: dist\n---\nexport const x = 1\n\nSubAgent dist', 'utf8')

      const plugin = new SubAgentInputCapability()
      const result = await plugin.collect(createContext(tempWorkspace))

      expect(result.subAgents?.length ?? 0).toBe(1)
      expect(result.subAgents?.[0]?.agentName).toBe('demo')
      expect(result.subAgents?.[0]?.canonicalName).toBe('demo')
      expect(result.subAgents?.[0]?.content).toContain('SubAgent dist')
      expect(result.subAgents?.[0]?.content).not.toContain('SubAgent source')
      expect(result.subAgents?.[0]?.content).not.toContain('export const x = 1')
      expect(result.subAgents?.[0]?.yamlFrontMatter?.description).toBe('dist')
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('extracts directory name as subagent prefix', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-subagent-prefix-test-'))
    const aindexDir = path.join(tempWorkspace, 'aindex')
    const srcDir = path.join(aindexDir, 'subagents', 'qa')
    const distDir = path.join(aindexDir, 'dist', 'subagents', 'qa')

    try {
      fs.mkdirSync(srcDir, {recursive: true})
      fs.mkdirSync(distDir, {recursive: true})

      const srcFile = path.join(srcDir, 'boot.src.mdx')
      const distFile = path.join(distDir, 'boot.mdx')
      fs.writeFileSync(srcFile, '---\ndescription: qa boot src\n---\nSubAgent source', 'utf8')
      fs.writeFileSync(distFile, '---\ndescription: qa boot dist\n---\nSubAgent dist', 'utf8')

      const plugin = new SubAgentInputCapability()
      const result = await plugin.collect(createContext(tempWorkspace))
      const [subAgent] = result.subAgents ?? []

      expect(result.subAgents?.length ?? 0).toBe(1)
      expect(subAgent?.agentPrefix).toBe('qa')
      expect(subAgent?.agentName).toBe('boot')
      expect(subAgent?.canonicalName).toBe('qa-boot')
      expect(subAgent?.content).toContain('SubAgent dist')
      expect(subAgent?.content).not.toContain('SubAgent source')
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('keeps rawMdxContent from dist for output-side recompilation', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-subagent-rawmdx-test-'))
    const aindexDir = path.join(tempWorkspace, 'aindex')
    const srcDir = path.join(aindexDir, 'subagents')
    const distDir = path.join(aindexDir, 'dist', 'subagents')

    try {
      fs.mkdirSync(srcDir, {recursive: true})
      fs.mkdirSync(distDir, {recursive: true})

      const srcFile = path.join(srcDir, 'demo.src.mdx')
      const distFile = path.join(distDir, 'demo.mdx')
      fs.writeFileSync(srcFile, '---\ndescription: src\n---\nSubAgent source', 'utf8')
      fs.writeFileSync(distFile, '---\ndescription: dist\n---\nexport const x = 1\n\nSubAgent dist', 'utf8')

      const plugin = new SubAgentInputCapability()
      const result = await plugin.collect(createContext(tempWorkspace))
      const [subAgent] = result.subAgents ?? []

      expect(subAgent?.rawMdxContent).toContain('export const x = 1')
      expect(subAgent?.content).toContain('SubAgent dist')
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('loads subagents from dist when the source tree is missing', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-subagent-dist-only-test-'))
    const aindexDir = path.join(tempWorkspace, 'aindex')
    const distDir = path.join(aindexDir, 'dist', 'subagents')

    try {
      fs.mkdirSync(distDir, {recursive: true})
      fs.writeFileSync(
        path.join(distDir, 'demo.mdx'),
        '---\ndescription: dist only\n---\nDist only subagent',
        'utf8'
      )

      const plugin = new SubAgentInputCapability()
      const result = await plugin.collect(createContext(tempWorkspace))

      expect(result.subAgents?.length ?? 0).toBe(1)
      expect(result.subAgents?.[0]?.agentName).toBe('demo')
      expect(result.subAgents?.[0]?.canonicalName).toBe('demo')
      expect(result.subAgents?.[0]?.content).toContain('Dist only subagent')
      expect(result.subAgents?.[0]?.yamlFrontMatter?.description).toBe('dist only')
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('fails hard when source exists without a compiled dist pair', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-subagent-source-only-test-'))
    const srcDir = path.join(tempWorkspace, 'aindex', 'subagents')

    try {
      fs.mkdirSync(srcDir, {recursive: true})
      fs.writeFileSync(
        path.join(srcDir, 'demo.src.mdx'),
        '---\ndescription: source only\n---\nSource only subagent',
        'utf8'
      )

      const plugin = new SubAgentInputCapability()
      await expect(plugin.collect(createContext(tempWorkspace))).rejects.toThrow('Missing compiled dist prompt')
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('rejects workspace as an unsupported subagent scope', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-subagent-workspace-scope-test-'))
    const distDir = path.join(tempWorkspace, 'aindex', 'dist', 'subagents')

    try {
      fs.mkdirSync(distDir, {recursive: true})
      fs.writeFileSync(
        path.join(distDir, 'demo.mdx'),
        '---\ndescription: dist only\nscope: workspace\n---\nDist only subagent',
        'utf8'
      )

      const plugin = new SubAgentInputCapability()
      await expect(plugin.collect(createContext(tempWorkspace))).rejects.toThrow('Field "scope" must be "project" or "global"')
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('warns and ignores authored subagent names', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-subagent-name-warning-test-'))
    const warnings: string[] = []
    const aindexDir = path.join(tempWorkspace, 'aindex')
    const srcDir = path.join(aindexDir, 'subagents', 'qa')
    const distDir = path.join(aindexDir, 'dist', 'subagents', 'qa')

    try {
      fs.mkdirSync(srcDir, {recursive: true})
      fs.mkdirSync(distDir, {recursive: true})

      fs.writeFileSync(path.join(srcDir, 'boot.src.mdx'), '---\nname: review-helper\ndescription: src\n---\nSubAgent source', 'utf8')
      fs.writeFileSync(path.join(distDir, 'boot.mdx'), '---\nname: review-helper\ndescription: dist\n---\nSubAgent dist', 'utf8')

      const logger = {
        trace: () => {},
        debug: () => {},
        info: () => {},
        warn: diagnostic => warnings.push(diagnostic.code),
        error: () => {},
        fatal: () => {}
      }

      const options = mergeConfig({workspaceDir: tempWorkspace})
      const plugin = new SubAgentInputCapability()
      const result = await plugin.collect({
        logger,
        fs,
        path,
        glob,
        userConfigOptions: options,
        dependencyContext: {}
      } as InputCapabilityContext)

      const [subAgent] = result.subAgents ?? []
      expect(subAgent?.canonicalName).toBe('qa-boot')
      expect('name' in (subAgent?.yamlFrontMatter ?? {})).toBe(false)
      expect(warnings).toContain('SUBAGENT_NAME_IGNORED')
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('does not log the legacy agents field name in subagent debug output', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-subagent-debug-log-test-'))
    const aindexDir = path.join(tempWorkspace, 'aindex')
    const distDir = path.join(aindexDir, 'dist', 'subagents')
    const debugPayloads: unknown[] = []

    try {
      fs.mkdirSync(distDir, {recursive: true})
      fs.writeFileSync(
        path.join(distDir, 'demo.mdx'),
        '---\ndescription: dist only\n---\nDist only subagent',
        'utf8'
      )

      const plugin = new SubAgentInputCapability()
      await plugin.collect({
        logger: {
          trace: () => {},
          debug: (_message: string, payload?: unknown) => debugPayloads.push(payload),
          info: () => {},
          warn: () => {},
          error: () => {},
          fatal: () => {}
        },
        fs,
        path,
        glob,
        userConfigOptions: mergeConfig({workspaceDir: tempWorkspace}),
        dependencyContext: {}
      } as InputCapabilityContext)

      expect(debugPayloads).toContainEqual({count: 1})
      expect(debugPayloads.some(payload =>
        typeof payload === 'object'
        && payload !== null
        && 'agents' in payload)).toBe(false)
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })
})
