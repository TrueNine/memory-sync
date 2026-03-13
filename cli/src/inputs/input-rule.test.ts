import type {InputPluginContext} from '../plugins/plugin-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import glob from 'fast-glob'
import {describe, expect, it} from 'vitest'
import {mergeConfig} from '../config'
import {createLogger} from '../plugins/plugin-core'
import {RuleInputPlugin} from './input-rule'

function createContext(tempWorkspace: string): InputPluginContext {
  const options = mergeConfig({workspaceDir: tempWorkspace})

  return {
    logger: createLogger('RuleInputPluginTest', 'error'),
    fs,
    path,
    glob,
    userConfigOptions: options,
    dependencyContext: {}
  } as InputPluginContext
}

describe('rule input plugin', () => {
  it('loads rules from .src.mdx source files', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-rule-src-test-'))
    const aindexDir = path.join(tempWorkspace, 'aindex')
    const srcDir = path.join(aindexDir, 'rules', 'qa')

    try {
      fs.mkdirSync(srcDir, {recursive: true})
      fs.writeFileSync(
        path.join(srcDir, 'boot.src.mdx'),
        '---\ndescription: source only\n---\nSource only rule',
        'utf8'
      )

      const plugin = new RuleInputPlugin()
      const result = await plugin.collect(createContext(tempWorkspace))

      expect(result.rules?.length ?? 0).toBe(1)
      expect(result.rules?.[0]?.ruleName).toBe('boot')
      expect(result.rules?.[0]?.content).toContain('Source only rule')
      expect(result.rules?.[0]?.scope).toBe('project')
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
        '---\nscope: global\nglobs:\n  - "**/*.ts"\n---\nDist only rule',
        'utf8'
      )

      const plugin = new RuleInputPlugin()
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
})
