import type {FastCommandPrompt, OutputWriteContext, Project, ProjectChildrenMemoryPrompt, WriteResult} from '@/types'
import type {RelativePath} from '@/types/FileSystemTypes'
import * as fc from 'fast-check'
import {describe, expect, it} from 'vitest'
import {FilePathKind, PromptKind} from '@/types'
import {TraeIDEOutputPlugin} from './TraeIDEOutputPlugin'

function createMockRelativePath(pathStr: string, basePath: string): RelativePath {
  return {
    pathKind: FilePathKind.Relative,
    path: pathStr,
    basePath,
    getDirectoryName: () => pathStr,
    getAbsolutePath: () => `${basePath}/${pathStr}`
  }
}

function createMockFastCommandPrompt(
  series: string | undefined,
  commandName: string
): FastCommandPrompt {
  return {
    type: PromptKind.FastCommand,
    series,
    commandName,
    content: '',
    length: 0,
    filePathKind: FilePathKind.Relative,
    dir: createMockRelativePath('.', '/test'),
    markdownContents: []
  } as FastCommandPrompt
}

class TestableTraeIDEOutputPlugin extends TraeIDEOutputPlugin {
  private mockHomeDir: string | null = null
  public capturedWriteFile: {path: string; content: string} | null = null

  public testBuildFastCommandSteeringFileName(cmd: FastCommandPrompt): string {
    return (this as any).buildFastCommandSteeringFileName(cmd)
  }

  public async testWriteSteeringFile(ctx: OutputWriteContext, project: Project, child: ProjectChildrenMemoryPrompt): Promise<WriteResult> {
    return (this as any).writeSteeringFile(ctx, project, child)
  }

  public setMockHomeDir(dir: string | null): void {
    this.mockHomeDir = dir
  }

  protected override getHomeDir(): string {
    if (this.mockHomeDir != null) return this.mockHomeDir
    return super.getHomeDir()
  }

  protected override async writeFile(_ctx: OutputWriteContext, path: string, content: string): Promise<WriteResult> {
    this.capturedWriteFile = {path, content}
    return {success: true, description: 'Mock write', filePath: path}
  }
}

describe('TraeIDEOutputPlugin', () => {
  describe('buildFastCommandSteeringFileName', () => {
    const alphanumericNoUnderscore = fc.string({minLength: 1, maxLength: 10, unit: 'grapheme-ascii'})
      .filter(s => /^[a-z0-9]+$/i.test(s))

    const alphanumericCommandName = fc.string({minLength: 1, maxLength: 20, unit: 'grapheme-ascii'})
      .filter(s => /^\w+$/.test(s))

    it('should use hyphen separator between series and command name', () => {
      fc.assert(
        fc.property(
          alphanumericNoUnderscore,
          alphanumericCommandName,
          (series, commandName) => {
            const plugin = new TestableTraeIDEOutputPlugin()
            const cmd = createMockFastCommandPrompt(series, commandName)

            const result = plugin.testBuildFastCommandSteeringFileName(cmd)

            expect(result).toBe(`${series}-${commandName}.md`)
          }
        ),
        {numRuns: 100}
      )
    })

    it('should return just commandName.md when series is undefined', () => {
      fc.assert(
        fc.property(
          alphanumericCommandName,
          commandName => {
            const plugin = new TestableTraeIDEOutputPlugin()
            const cmd = createMockFastCommandPrompt(void 0, commandName)

            const result = plugin.testBuildFastCommandSteeringFileName(cmd)

            expect(result).toBe(`${commandName}.md`)
          }
        ),
        {numRuns: 100}
      )
    })
  })

  describe('writeSteeringFile (Child Memory Prompts)', () => {
    it('should write to .trae/rules with correct frontmatter', async () => {
      const plugin = new TestableTraeIDEOutputPlugin()
      const project = {
        dirFromWorkspacePath: {
          path: 'packages/pkg-a',
          basePath: '/workspace'
        }
      } as any
      const child = {
        dir: { path: 'src/components' },
        workingChildDirectoryPath: { path: 'src/components' },
        content: 'child content'
      } as any
      const ctx = {
        dryRun: false
      } as any

      await plugin.testWriteSteeringFile(ctx, project, child)

      expect(plugin.capturedWriteFile).not.toBeNull()
      const {path, content} = plugin.capturedWriteFile!
      
      // Verify path contains .trae/rules
      expect(path.replaceAll('\\', '/')).toContain('/.trae/rules/')
      
      // Verify frontmatter
      expect(content).toContain('---')
      expect(content).toContain('alwaysApply: false')
      expect(content).toContain('globs: src/components/**')
      expect(content).toContain('child content')
    })
  })
})
