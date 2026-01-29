import type {
  CollectedInputContext,
  FastCommandPrompt,
  GlobalMemoryPrompt,
  OutputPluginContext,
  OutputWriteContext,
  ProjectChildrenMemoryPrompt,
  ProjectRootMemoryPrompt
} from '@/types'
import type {RelativePath} from '@/types/FileSystemTypes'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {FilePathKind, PromptKind} from '@/types'
import {QoderIDEPluginOutputPlugin} from './QoderIDEPluginOutputPlugin'

vi.mock('node:fs')

const MOCK_WORKSPACE_DIR = '/workspace/test'

class TestableQoderIDEPluginOutputPlugin extends QoderIDEPluginOutputPlugin {
  private mockHomeDir: string | null = null

  public setMockHomeDir(dir: string | null): void {
    this.mockHomeDir = dir
  }

  protected override getHomeDir(): string {
    if (this.mockHomeDir != null) return this.mockHomeDir
    return super.getHomeDir()
  }
}

function createMockRelativePath(pathStr: string, basePath: string): RelativePath {
  return {
    pathKind: FilePathKind.Relative,
    path: pathStr,
    basePath,
    getDirectoryName: () => path.basename(pathStr),
    getAbsolutePath: () => path.join(basePath, pathStr)
  }
}

function createMockRootMemoryPrompt(content: string, basePath: string): ProjectRootMemoryPrompt {
  return {
    type: PromptKind.ProjectRootMemory,
    content,
    dir: createMockRelativePath('.', basePath),
    markdownContents: [],
    length: content.length,
    filePathKind: FilePathKind.Relative
  } as ProjectRootMemoryPrompt
}

function createMockChildMemoryPrompt(
  content: string,
  projectPath: string,
  basePath: string,
  workingPath?: string
): ProjectChildrenMemoryPrompt {
  const childPath = workingPath ?? projectPath
  return {
    type: PromptKind.ProjectChildrenMemory,
    dir: createMockRelativePath(projectPath, basePath),
    workingChildDirectoryPath: createMockRelativePath(childPath, basePath),
    content,
    markdownContents: [],
    length: content.length,
    filePathKind: FilePathKind.Relative
  } as ProjectChildrenMemoryPrompt
}

function createMockGlobalMemoryPrompt(content: string, basePath: string): GlobalMemoryPrompt {
  return {
    type: PromptKind.GlobalMemory,
    content,
    dir: createMockRelativePath('.', basePath),
    markdownContents: [],
    length: content.length,
    filePathKind: FilePathKind.Relative,
    parentDirectoryPath: {
      type: 'UserHome',
      directory: createMockRelativePath('.qoder', basePath)
    }
  } as GlobalMemoryPrompt
}

function createMockFastCommandPrompt(
  commandName: string,
  series?: string
): FastCommandPrompt {
  const content = 'Run something'
  return {
    type: PromptKind.FastCommand,
    content,
    length: content.length,
    filePathKind: FilePathKind.Relative,
    dir: createMockRelativePath('.', MOCK_WORKSPACE_DIR),
    markdownContents: [],
    yamlFrontMatter: {
      description: 'Fast command'
    },
    ...series != null && {series},
    commandName
  } as FastCommandPrompt
}

function createMockOutputPluginContext(
  collectedInputContext: Partial<CollectedInputContext>
): OutputPluginContext {
  return {
    collectedInputContext: {
      workspace: {
        directory: createMockRelativePath('.', MOCK_WORKSPACE_DIR),
        projects: []
      },
      ideConfigFiles: [],
      ...collectedInputContext
    } as CollectedInputContext
  }
}

function createMockOutputWriteContext(
  collectedInputContext: Partial<CollectedInputContext>,
  dryRun = false
): OutputWriteContext {
  return {
    collectedInputContext: {
      workspace: {
        directory: createMockRelativePath('.', MOCK_WORKSPACE_DIR),
        projects: []
      },
      ideConfigFiles: [],
      ...collectedInputContext
    } as CollectedInputContext,
    dryRun
  }
}

describe('qoder IDE plugin output plugin', () => {
  let plugin: TestableQoderIDEPluginOutputPlugin

  beforeEach(() => {
    plugin = new TestableQoderIDEPluginOutputPlugin()
    plugin.setMockHomeDir('/home/test')
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.mkdirSync).mockReturnValue(void 0)
    vi.mocked(fs.writeFileSync).mockReturnValue(void 0)
  })

  afterEach(() => vi.clearAllMocks())

  describe('registerProjectOutputDirs', () => {
    it('should register .qoder/rules for each project', async () => {
      const ctx = createMockOutputPluginContext({
        workspace: {
          directory: createMockRelativePath('.', MOCK_WORKSPACE_DIR),
          projects: [
            {dirFromWorkspacePath: createMockRelativePath('project-a', MOCK_WORKSPACE_DIR)},
            {dirFromWorkspacePath: createMockRelativePath('project-b', MOCK_WORKSPACE_DIR)}
          ]
        }
      })

      const results = await plugin.registerProjectOutputDirs(ctx)

      expect(results).toHaveLength(2)
      expect(results[0].path).toBe(path.join('project-a', '.qoder', 'rules'))
      expect(results[1].path).toBe(path.join('project-b', '.qoder', 'rules'))
    })
  })

  describe('registerProjectOutputFiles', () => {
    it('should register global.md, always.md, and child glob rules', async () => {
      const projectDir = createMockRelativePath('project-a', MOCK_WORKSPACE_DIR)
      const ctx = createMockOutputPluginContext({
        globalMemory: createMockGlobalMemoryPrompt('Global rules', MOCK_WORKSPACE_DIR),
        workspace: {
          directory: createMockRelativePath('.', MOCK_WORKSPACE_DIR),
          projects: [
            {
              dirFromWorkspacePath: projectDir,
              rootMemoryPrompt: createMockRootMemoryPrompt('Root rules', MOCK_WORKSPACE_DIR),
              childMemoryPrompts: [
                createMockChildMemoryPrompt('Child rules', 'project-a/src', MOCK_WORKSPACE_DIR, 'src')
              ]
            }
          ]
        }
      })

      const results = await plugin.registerProjectOutputFiles(ctx)

      const paths = results.map(r => r.path)
      expect(paths).toContain(path.join('project-a', '.qoder', 'rules', 'global.md'))
      expect(paths).toContain(path.join('project-a', '.qoder', 'rules', 'always.md'))
      expect(paths).toContain(path.join('project-a', '.qoder', 'rules', 'glob-src.md'))
    })
  })

  describe('registerGlobalOutputDirs', () => {
    it('should return empty when no fast commands exist', async () => {
      const ctx = createMockOutputPluginContext({})
      const results = await plugin.registerGlobalOutputDirs(ctx)
      expect(results).toHaveLength(0)
    })

    it('should register ~/.qoder/commands when fast commands exist', async () => {
      const ctx = createMockOutputPluginContext({
        fastCommands: [createMockFastCommandPrompt('compile')]
      })

      const results = await plugin.registerGlobalOutputDirs(ctx)

      expect(results).toHaveLength(1)
      expect(results[0].basePath).toBe(path.join('/home/test', '.qoder'))
      expect(results[0].path).toBe('commands')
    })
  })

  describe('registerGlobalOutputFiles', () => {
    it('should register fast command files under ~/.qoder/commands', async () => {
      const ctx = createMockOutputPluginContext({
        fastCommands: [
          createMockFastCommandPrompt('compile', 'build'),
          createMockFastCommandPrompt('test')
        ]
      })

      const results = await plugin.registerGlobalOutputFiles(ctx)

      const paths = results.map(r => r.path)
      expect(paths).toContain('build_compile.md')
      expect(paths).toContain('test.md')
    })
  })

  describe('canWrite', () => {
    it('should return true when project prompts exist', async () => {
      const ctx = createMockOutputWriteContext({
        workspace: {
          directory: createMockRelativePath('.', MOCK_WORKSPACE_DIR),
          projects: [
            {
              dirFromWorkspacePath: createMockRelativePath('project-a', MOCK_WORKSPACE_DIR),
              rootMemoryPrompt: createMockRootMemoryPrompt('Root rules', MOCK_WORKSPACE_DIR)
            }
          ]
        }
      })

      const result = await plugin.canWrite(ctx)
      expect(result).toBe(true)
    })

    it('should return false when nothing to write', async () => {
      const ctx = createMockOutputWriteContext({
        workspace: {
          directory: createMockRelativePath('.', MOCK_WORKSPACE_DIR),
          projects: []
        }
      })

      const result = await plugin.canWrite(ctx)
      expect(result).toBe(false)
    })
  })

  describe('writeProjectOutputs', () => {
    it('should write global, root, and child rule files with front matter', async () => {
      const projectDir = createMockRelativePath('project-a', MOCK_WORKSPACE_DIR)
      const ctx = createMockOutputWriteContext({
        globalMemory: createMockGlobalMemoryPrompt('Global rules', MOCK_WORKSPACE_DIR),
        workspace: {
          directory: createMockRelativePath('.', MOCK_WORKSPACE_DIR),
          projects: [
            {
              dirFromWorkspacePath: projectDir,
              rootMemoryPrompt: createMockRootMemoryPrompt('Root rules', MOCK_WORKSPACE_DIR),
              childMemoryPrompts: [
                createMockChildMemoryPrompt('Child rules', 'project-a/src', MOCK_WORKSPACE_DIR, 'src')
              ]
            }
          ]
        }
      })

      const results = await plugin.writeProjectOutputs(ctx)

      expect(results.files).toHaveLength(3)

      const [calls] = [vi.mocked(fs.writeFileSync).mock.calls]
      expect(calls).toHaveLength(3)

      const globalCall = calls.find(call => String(call[0]).includes(path.join('project-a', '.qoder', 'rules', 'global.md')))
      const rootCall = calls.find(call => String(call[0]).includes(path.join('project-a', '.qoder', 'rules', 'always.md')))
      const childCall = calls.find(call => String(call[0]).includes(path.join('project-a', '.qoder', 'rules', 'glob-src.md')))

      expect(globalCall).toBeDefined()
      expect(rootCall).toBeDefined()
      expect(childCall).toBeDefined()

      expect(String(globalCall?.[1])).toContain('trigger: always_on')
      expect(String(globalCall?.[1])).toContain('Global rules')

      expect(String(rootCall?.[1])).toContain('trigger: always_on')
      expect(String(rootCall?.[1])).toContain('Root rules')

      expect(String(childCall?.[1])).toContain('trigger: glob')
      expect(String(childCall?.[1])).toContain('glob: src/**')
      expect(String(childCall?.[1])).toContain('Child rules')
    })
  })

  describe('writeGlobalOutputs', () => {
    it('should write fast command files with front matter', async () => {
      const ctx = createMockOutputWriteContext({
        fastCommands: [
          createMockFastCommandPrompt('compile', 'build')
        ]
      })

      const results = await plugin.writeGlobalOutputs(ctx)

      expect(results.files).toHaveLength(1)

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0]
      expect(String(writeCall?.[0])).toContain(path.join('.qoder', 'commands', 'build_compile.md'))
      expect(String(writeCall?.[1])).toContain('description: Fast command')
      expect(String(writeCall?.[1])).toContain('Run something')
    })
  })
})
