import type {OutputCleanContext} from './plugin-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import glob from 'fast-glob'
import {describe, expect, it} from 'vitest'
import {CursorOutputPlugin} from './CursorOutputPlugin'
import {FilePathKind} from './plugin-core'

class TestCursorOutputPlugin extends CursorOutputPlugin {
  constructor(private readonly testHomeDir: string) {
    super()
  }

  protected override getHomeDir(): string {
    return this.testHomeDir
  }
}

function createCleanContext(): OutputCleanContext {
  return {
    logger: {
      trace: () => {},
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      fatal: () => {}
    },
    fs,
    path,
    glob,
    dryRun: true,
    collectedOutputContext: {
      workspace: {
        directory: {
          pathKind: FilePathKind.Relative,
          path: '.',
          basePath: '.',
          getDirectoryName: () => '.',
          getAbsolutePath: () => path.resolve('.')
        },
        projects: []
      }
    }
  } as OutputCleanContext
}

describe('cursorOutputPlugin cleanup', () => {
  it('expands skills cleanup glob into explicit stale targets while preserving built-in skills', async () => {
    const tempHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-cursor-cleanup-'))
    const skillsDir = path.join(tempHomeDir, '.cursor', 'skills-cursor')
    const preservedDir = path.join(skillsDir, 'create-rule')
    const staleDir = path.join(skillsDir, 'legacy-skill')

    fs.mkdirSync(preservedDir, {recursive: true})
    fs.mkdirSync(staleDir, {recursive: true})
    fs.writeFileSync(path.join(preservedDir, 'SKILL.md'), '# preserved', 'utf8')
    fs.writeFileSync(path.join(staleDir, 'SKILL.md'), '# stale', 'utf8')

    try {
      const plugin = new TestCursorOutputPlugin(tempHomeDir)
      const result = await plugin.declareCleanupPaths(createCleanContext())
      const deletePaths = result.delete?.map(target => target.path.replaceAll('\\', '/')) ?? []
      const protectPaths = result.protect?.map(target => target.path.replaceAll('\\', '/')) ?? []
      const normalizedCommandsDir = path.join(tempHomeDir, '.cursor', 'commands').replaceAll('\\', '/')
      const normalizedStaleDir = staleDir.replaceAll('\\', '/')
      const normalizedPreservedDir = preservedDir.replaceAll('\\', '/')

      expect(deletePaths).toContain(normalizedCommandsDir)
      expect(deletePaths).toContain(normalizedStaleDir)
      expect(result.delete?.some(target => target.kind === 'glob' && target.path.includes('skills-cursor'))).toBe(false)
      expect(deletePaths).not.toContain(normalizedPreservedDir)
      expect(protectPaths).toContain(normalizedPreservedDir)
    }
    finally {
      fs.rmSync(tempHomeDir, {recursive: true, force: true})
    }
  })
})
