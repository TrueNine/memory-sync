import type {InputCapabilityContext} from '../plugins/plugin-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import glob from 'fast-glob'
import {describe, expect, it} from 'vitest'
import {mergeConfig} from '../config'
import {createLogger} from '../plugins/plugin-core'
import {RuleInputCapability} from './input-rule'

function createContext(tempWorkspace: string): InputCapabilityContext {
  const options = mergeConfig({workspaceDir: tempWorkspace})

  return {
    logger: createLogger('RuleInputCapabilityTest', 'error'),
    fs,
    path,
    glob,
    userConfigOptions: options,
    dependencyContext: {}
  } as InputCapabilityContext
}

describe('rule input plugin', () => {
  it('fails hard when source exists without a compiled dist pair', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-rule-src-test-'))
    const aindexDir = path.join(tempWorkspace, 'aindex')
    const srcDir = path.join(aindexDir, 'rules', 'qa')

    try {
      fs.mkdirSync(srcDir, {recursive: true})
      fs.writeFileSync(
        path.join(srcDir, 'boot.src.mdx'),
        '---\ndescription: source only\nglobs:\n  - "**/*.ts"\n---\nSource only rule',
        'utf8'
      )

      const plugin = new RuleInputCapability()
      await expect(plugin.collect(createContext(tempWorkspace))).rejects.toThrow('Missing compiled dist prompt')
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('loads rules from dist when the source tree is missing', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-rule-dist-only-test-'))
    const aindexDir = path.join(tempWorkspace, 'aindex')
    const distDir = path.join(aindexDir, 'dist', 'rules', 'qa')

    try {
      fs.mkdirSync(distDir, {recursive: true})
      fs.writeFileSync(
        path.join(distDir, 'boot.mdx'),
        '---\nscope: global\ndescription: Dist only rule\nglobs:\n  - "**/*.ts"\n---\nDist only rule',
        'utf8'
      )

      const plugin = new RuleInputCapability()
      const result = await plugin.collect(createContext(tempWorkspace))

      expect(result.rules?.length ?? 0).toBe(1)
      expect(result.rules?.[0]?.ruleName).toBe('boot')
      expect(result.rules?.[0]?.content).toContain('Dist only rule')
      expect(result.rules?.[0]?.scope).toBe('global')
      expect(result.rules?.[0]?.globs).toEqual(['**/*.ts'])
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('rejects workspace as an unsupported rule scope', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-rule-workspace-scope-test-'))
    const aindexDir = path.join(tempWorkspace, 'aindex')
    const distDir = path.join(aindexDir, 'dist', 'rules', 'qa')

    try {
      fs.mkdirSync(distDir, {recursive: true})
      fs.writeFileSync(
        path.join(distDir, 'boot.mdx'),
        '---\nscope: workspace\ndescription: Dist only rule\nglobs:\n  - "**/*.ts"\n---\nDist only rule',
        'utf8'
      )

      const plugin = new RuleInputCapability()
      await expect(plugin.collect(createContext(tempWorkspace))).rejects.toThrow('Field "scope" must be "project" or "global"')
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })
})
