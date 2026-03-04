import type {InputPluginContext} from '../plugins/plugin-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import glob from 'fast-glob'
import {describe, expect, it} from 'vitest'
import {mergeConfig} from '../config'
import {createLogger} from '../plugins/plugin-core'
import {CommandInputPlugin} from './input-command'

function createContext(tempWorkspace: string): InputPluginContext {
  const options = mergeConfig({workspaceDir: tempWorkspace})

  return {
    logger: createLogger('CommandInputPluginTest', 'error'),
    fs,
    path,
    glob,
    userConfigOptions: options,
    dependencyContext: {}
  } as InputPluginContext
}

describe('command input plugin', () => {
  it('prefers dist content, and dist also runs mdx-to-md compilation', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-command-test-'))
    const aindexDir = path.join(tempWorkspace, 'aindex')
    const srcDir = path.join(aindexDir, 'commands')
    const distDir = path.join(aindexDir, 'dist', 'commands')

    try {
      fs.mkdirSync(srcDir, {recursive: true})
      fs.mkdirSync(distDir, {recursive: true})

      const srcFile = path.join(srcDir, 'demo.cn.mdx')
      const distFile = path.join(distDir, 'demo.mdx')
      const srcContent = '---\ndescription: src\n---\nCommand source'
      const distContent = '---\ndescription: dist\n---\nexport const x = 1\n\nCommand dist'
      fs.writeFileSync(srcFile, srcContent, 'utf8')
      fs.writeFileSync(distFile, distContent, 'utf8')

      const plugin = new CommandInputPlugin()
      const result = await plugin.collect(createContext(tempWorkspace))
      const [command] = result.commands ?? []

      expect(result.commands?.length ?? 0).toBe(1)
      expect(command?.commandName).toBe('demo')
      expect(command?.content).toContain('Command dist')
      expect(command?.content).not.toContain('Command source')
      expect(command?.content).not.toContain('export const x = 1')
      expect(command?.yamlFrontMatter?.description).toBe('dist')
      expect(command?.rawMdxContent).toContain('export const x = 1')
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })
})
