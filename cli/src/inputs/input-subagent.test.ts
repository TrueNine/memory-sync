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
  it('collects subagents from .cn.mdx source files', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-subagent-test-'))
    const aindexDir = path.join(tempWorkspace, 'aindex')
    const srcDir = path.join(aindexDir, 'subagents')
    const distDir = path.join(aindexDir, 'dist', 'subagents')

    try {
      fs.mkdirSync(srcDir, {recursive: true})
      fs.mkdirSync(distDir, {recursive: true})

      const srcFile = path.join(srcDir, 'demo.cn.mdx')
      const distFile = path.join(distDir, 'demo.mdx')
      fs.writeFileSync(srcFile, '---\ndescription: demo\n---\nSubAgent source', 'utf8')
      fs.writeFileSync(distFile, 'SubAgent dist', 'utf8')

      const plugin = new SubAgentInputPlugin()
      const result = await plugin.collect(createContext(tempWorkspace))

      expect(result.subAgents?.length ?? 0).toBe(1)
      expect(result.subAgents?.[0]?.agentName).toBe('demo')
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
      fs.writeFileSync(srcFile, '---\ndescription: qa boot\n---\nSubAgent source', 'utf8')
      fs.writeFileSync(distFile, 'SubAgent dist', 'utf8')

      const plugin = new SubAgentInputPlugin()
      const result = await plugin.collect(createContext(tempWorkspace))
      const [subAgent] = result.subAgents ?? []

      expect(result.subAgents?.length ?? 0).toBe(1)
      expect(subAgent?.agentPrefix).toBe('qa')
      expect(subAgent?.agentName).toBe('boot')
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })
})
