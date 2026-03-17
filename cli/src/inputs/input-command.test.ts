import type {InputCapabilityContext} from '../plugins/plugin-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import glob from 'fast-glob'
import {describe, expect, it} from 'vitest'
import {mergeConfig} from '../config'
import {createLogger} from '../plugins/plugin-core'
import {CommandInputCapability} from './input-command'

const legacySourceExtension = '.cn.mdx'

function createContext(tempWorkspace: string): InputCapabilityContext {
  const options = mergeConfig({workspaceDir: tempWorkspace})

  return {
    logger: createLogger('CommandInputCapabilityTest', 'error'),
    fs,
    path,
    glob,
    userConfigOptions: options,
    dependencyContext: {}
  } as InputCapabilityContext
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

      const srcFile = path.join(srcDir, 'demo.src.mdx')
      const distFile = path.join(distDir, 'demo.mdx')
      const srcContent = '---\ndescription: src\n---\nCommand source'
      const distContent = '---\ndescription: dist\n---\nexport const x = 1\n\nCommand dist'
      fs.writeFileSync(srcFile, srcContent, 'utf8')
      fs.writeFileSync(distFile, distContent, 'utf8')

      const plugin = new CommandInputCapability()
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

  it('loads commands from dist when the source tree is missing', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-command-dist-only-test-'))
    const aindexDir = path.join(tempWorkspace, 'aindex')
    const distDir = path.join(aindexDir, 'dist', 'commands')

    try {
      fs.mkdirSync(distDir, {recursive: true})
      fs.writeFileSync(
        path.join(distDir, 'demo.mdx'),
        '---\ndescription: dist only\n---\nDist only command',
        'utf8'
      )

      const plugin = new CommandInputCapability()
      const result = await plugin.collect(createContext(tempWorkspace))

      expect(result.commands?.length ?? 0).toBe(1)
      expect(result.commands?.[0]?.commandName).toBe('demo')
      expect(result.commands?.[0]?.content).toContain('Dist only command')
      expect(result.commands?.[0]?.yamlFrontMatter?.description).toBe('dist only')
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('fails hard when source exists without a compiled dist pair', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-command-source-only-test-'))
    const srcDir = path.join(tempWorkspace, 'aindex', 'commands')

    try {
      fs.mkdirSync(srcDir, {recursive: true})
      fs.writeFileSync(
        path.join(srcDir, 'demo.src.mdx'),
        '---\ndescription: source only\n---\nSource only command',
        'utf8'
      )

      const plugin = new CommandInputCapability()
      await expect(plugin.collect(createContext(tempWorkspace))).rejects.toThrow('Missing compiled dist prompt')
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('ignores legacy cn command sources', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-command-legacy-test-'))
    const srcDir = path.join(tempWorkspace, 'aindex', 'commands')

    try {
      fs.mkdirSync(srcDir, {recursive: true})
      fs.writeFileSync(
        path.join(srcDir, `demo${legacySourceExtension}`),
        '---\ndescription: legacy\n---\nLegacy command',
        'utf8'
      )

      const plugin = new CommandInputCapability()
      const result = await plugin.collect(createContext(tempWorkspace))

      expect(result.commands ?? []).toHaveLength(0)
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('rejects workspace as an unsupported command scope', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-command-workspace-scope-test-'))
    const distDir = path.join(tempWorkspace, 'aindex', 'dist', 'commands')

    try {
      fs.mkdirSync(distDir, {recursive: true})
      fs.writeFileSync(
        path.join(distDir, 'demo.mdx'),
        '---\nscope: workspace\n---\nDist only command',
        'utf8'
      )

      const plugin = new CommandInputCapability()
      await expect(plugin.collect(createContext(tempWorkspace))).rejects.toThrow('Field "scope" must be "project" or "global"')
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })
})
