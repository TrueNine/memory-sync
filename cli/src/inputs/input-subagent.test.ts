import type {InputPluginContext} from '../plugins/plugin-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import glob from 'fast-glob'
import {describe, expect, it} from 'vitest'
import {mergeConfig} from '../config'
import {createLogger} from '../plugins/plugin-core'
import {SubAgentInputPlugin} from './input-subagent'

function createContext(tempWorkspace: string): InputPluginContext {
  const options = mergeConfig({workspaceDir: tempWorkspace})

  return {
    logger: createLogger('SubAgentInputPluginTest', 'error'),
    fs,
    path,
    glob,
    userConfigOptions: options,
    dependencyContext: {}
  } as InputPluginContext
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

      const srcFile = path.join(srcDir, 'demo.cn.mdx')
      const distFile = path.join(distDir, 'demo.mdx')
      fs.writeFileSync(srcFile, '---\ndescription: src\n---\nSubAgent source', 'utf8')
      fs.writeFileSync(distFile, '---\ndescription: dist\n---\nexport const x = 1\n\nSubAgent dist', 'utf8')

      const plugin = new SubAgentInputPlugin()
      const result = await plugin.collect(createContext(tempWorkspace))

      expect(result.subAgents?.length ?? 0).toBe(1)
      expect(result.subAgents?.[0]?.agentName).toBe('demo')
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

      const srcFile = path.join(srcDir, 'boot.cn.mdx')
      const distFile = path.join(distDir, 'boot.mdx')
      fs.writeFileSync(srcFile, '---\ndescription: qa boot src\n---\nSubAgent source', 'utf8')
      fs.writeFileSync(distFile, 'SubAgent dist', 'utf8')

      const plugin = new SubAgentInputPlugin()
      const result = await plugin.collect(createContext(tempWorkspace))
      const [subAgent] = result.subAgents ?? []

      expect(result.subAgents?.length ?? 0).toBe(1)
      expect(subAgent?.agentPrefix).toBe('qa')
      expect(subAgent?.agentName).toBe('boot')
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

      const srcFile = path.join(srcDir, 'demo.cn.mdx')
      const distFile = path.join(distDir, 'demo.mdx')
      fs.writeFileSync(srcFile, '---\ndescription: src\n---\nSubAgent source', 'utf8')
      fs.writeFileSync(distFile, '---\ndescription: dist\n---\nexport const x = 1\n\nSubAgent dist', 'utf8')

      const plugin = new SubAgentInputPlugin()
      const result = await plugin.collect(createContext(tempWorkspace))
      const [subAgent] = result.subAgents ?? []

      expect(subAgent?.rawMdxContent).toContain('export const x = 1')
      expect(subAgent?.content).toContain('SubAgent dist')
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })
})
