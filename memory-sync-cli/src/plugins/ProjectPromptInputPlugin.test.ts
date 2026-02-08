import type {MdxGlobalScope} from '@/globals'
import type {ILogger} from '@/log'
import type {InputPluginContext, PluginOptions, Workspace} from '@/types'
import * as path from 'node:path'
import {describe, expect, it, vi} from 'vitest'
import {FilePathKind} from '@/types'
import {ProjectPromptInputPlugin} from './ProjectPromptInputPlugin'

const SHADOW_PROJECT_DIR = '/shadow'
const WORKSPACE_DIR = '/workspace'
const SHADOW_PROJECTS_DIR = '/shadow/dist/app'
const PROJECT_NAME = 'test-project'
const SHADOW_PROJECT_PATH = path.join(SHADOW_PROJECTS_DIR, PROJECT_NAME)
const TARGET_PROJECT_PATH = path.join(WORKSPACE_DIR, PROJECT_NAME)
const PROJECT_MEMORY_FILE = 'agt.mdx'
const SKIP_DIR_NODE_MODULES = 'node_modules'
const SKIP_DIR_GIT = '.git'
const MOCK_MDX_CONTENT = '# Test'

function createMockLogger(): ILogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn()
  }
}

function createMockOptions(): Required<PluginOptions> {
  return {
    workspaceDir: WORKSPACE_DIR,
    shadowSourceProjectDir: SHADOW_PROJECT_DIR,
    shadowSkillSourceDir: '/shadow/dist/skills',
    shadowFastCommandDir: '/shadow/dist/commands',
    shadowSubAgentDir: '/shadow/dist/agents',
    globalMemoryFile: '/shadow/dist/global.mdx',
    shadowProjectsDir: SHADOW_PROJECTS_DIR,
    externalProjects: [],
    excludePatterns: {},
    fastCommandSeriesOptions: {},
    plugins: [],
    logLevel: 'info'
  }
}

function createMockWorkspace(): Workspace {
  return {
    directory: {pathKind: FilePathKind.Root, path: WORKSPACE_DIR, getDirectoryName: () => 'workspace'},
    projects: [{
      name: PROJECT_NAME,
      dirFromWorkspacePath: {
        pathKind: FilePathKind.Relative,
        path: PROJECT_NAME,
        basePath: WORKSPACE_DIR,
        getDirectoryName: () => PROJECT_NAME,
        getAbsolutePath: () => TARGET_PROJECT_PATH
      }
    }]
  }
}

function createMockGlobalScope(): MdxGlobalScope {
  return {
    profile: {name: 'test', username: 'test', gender: 'male', birthday: '2000-01-01'},
    tool: {name: 'test'},
    env: {},
    os: {platform: 'linux', arch: 'x64', homedir: '/home/test'},
    Md: vi.fn() as unknown as MdxGlobalScope['Md']
  }
}

interface MockDirEntry {name: string, isDirectory: () => boolean, isFile: () => boolean}
const dirEntry = (name: string): MockDirEntry => ({name, isDirectory: () => true, isFile: () => false})

function createCtx(workspace: Workspace, mockFs: unknown): InputPluginContext {
  return {
    logger: createMockLogger(),
    fs: mockFs as typeof import('node:fs'),
    path,
    glob: vi.fn() as unknown as typeof import('fast-glob'),
    userConfigOptions: createMockOptions(),
    dependencyContext: {workspace},
    globalScope: createMockGlobalScope()
  }
}

describe('projectPromptInputPlugin', () => {
  describe('scanDirectoryRecursive - directory skip behavior', () => {
    it('should skip node_modules directory', async () => {
      const workspace = createMockWorkspace()
      const mockFs = {
        existsSync: vi.fn().mockImplementation((p: string) => {
          if (p === SHADOW_PROJECTS_DIR || p === SHADOW_PROJECT_PATH) return true
          if (p.includes(SKIP_DIR_NODE_MODULES)) return false
          return p.endsWith(PROJECT_MEMORY_FILE)
        }),
        statSync: vi.fn().mockReturnValue({isDirectory: () => true, isFile: () => true}),
        readdirSync: vi.fn().mockImplementation((dir: string) => {
          if (path.normalize(dir) === path.normalize(SHADOW_PROJECT_PATH)) return [dirEntry(SKIP_DIR_NODE_MODULES), dirEntry('src')]
          if (path.normalize(dir) === path.normalize(path.join(SHADOW_PROJECT_PATH, 'src'))) return []
          if (dir.includes(SKIP_DIR_NODE_MODULES)) throw new Error(`Should not scan ${SKIP_DIR_NODE_MODULES}`)
          return []
        }),
        readFileSync: vi.fn().mockReturnValue(MOCK_MDX_CONTENT)
      }
      const result = await new ProjectPromptInputPlugin().collect(createCtx(workspace, mockFs))
      const project = result.workspace?.projects.find(p => p.name === PROJECT_NAME)
      const matched = project?.childMemoryPrompts?.filter(c => c.dir.path.includes(SKIP_DIR_NODE_MODULES))
      expect(matched ?? []).toHaveLength(0)
    })

    it('should skip .git directory', async () => {
      const workspace = createMockWorkspace()
      const mockFs = {
        existsSync: vi.fn().mockImplementation((p: string) => {
          if (p === SHADOW_PROJECTS_DIR || p === SHADOW_PROJECT_PATH) return true
          if (p.includes(SKIP_DIR_GIT)) return false
          return p.endsWith(PROJECT_MEMORY_FILE)
        }),
        statSync: vi.fn().mockReturnValue({isDirectory: () => true, isFile: () => true}),
        readdirSync: vi.fn().mockImplementation((dir: string) => {
          if (path.normalize(dir) === path.normalize(SHADOW_PROJECT_PATH)) return [dirEntry(SKIP_DIR_GIT), dirEntry('src')]
          if (path.normalize(dir) === path.normalize(path.join(SHADOW_PROJECT_PATH, 'src'))) return []
          if (dir.includes(SKIP_DIR_GIT)) throw new Error(`Should not scan ${SKIP_DIR_GIT}`)
          return []
        }),
        readFileSync: vi.fn().mockReturnValue(MOCK_MDX_CONTENT)
      }
      const result = await new ProjectPromptInputPlugin().collect(createCtx(workspace, mockFs))
      const project = result.workspace?.projects.find(p => p.name === PROJECT_NAME)
      const matched = project?.childMemoryPrompts?.filter(c => c.dir.path.includes(SKIP_DIR_GIT))
      expect(matched ?? []).toHaveLength(0)
    })

    it('should allow .vscode directory with agt.mdx', async () => {
      const workspace = createMockWorkspace()
      const vscodeDir = '.vscode'
      const vscodePath = path.join(SHADOW_PROJECT_PATH, vscodeDir)
      const mockFs = {
        existsSync: vi.fn().mockImplementation((p: string) => {
          if (p === SHADOW_PROJECTS_DIR || p === SHADOW_PROJECT_PATH) return true
          return path.normalize(p) === path.normalize(path.join(vscodePath, PROJECT_MEMORY_FILE))
        }),
        statSync: vi.fn().mockReturnValue({isDirectory: () => true, isFile: () => true}),
        readdirSync: vi.fn().mockImplementation((dir: string) => {
          if (path.normalize(dir) === path.normalize(SHADOW_PROJECT_PATH)) return [dirEntry(vscodeDir)]
          return []
        }),
        readFileSync: vi.fn().mockReturnValue(MOCK_MDX_CONTENT)
      }
      const result = await new ProjectPromptInputPlugin().collect(createCtx(workspace, mockFs))
      const project = result.workspace?.projects.find(p => p.name === PROJECT_NAME)
      expect(project?.childMemoryPrompts).toHaveLength(1)
      expect(project?.childMemoryPrompts?.[0]?.dir.path).toBe(vscodeDir)
    })

    it('should allow .idea directory with agt.mdx', async () => {
      const workspace = createMockWorkspace()
      const ideaDir = '.idea'
      const ideaPath = path.join(SHADOW_PROJECT_PATH, ideaDir)
      const mockFs = {
        existsSync: vi.fn().mockImplementation((p: string) => {
          if (p === SHADOW_PROJECTS_DIR || p === SHADOW_PROJECT_PATH) return true
          return path.normalize(p) === path.normalize(path.join(ideaPath, PROJECT_MEMORY_FILE))
        }),
        statSync: vi.fn().mockReturnValue({isDirectory: () => true, isFile: () => true}),
        readdirSync: vi.fn().mockImplementation((dir: string) => {
          if (path.normalize(dir) === path.normalize(SHADOW_PROJECT_PATH)) return [dirEntry(ideaDir)]
          return []
        }),
        readFileSync: vi.fn().mockReturnValue(MOCK_MDX_CONTENT)
      }
      const result = await new ProjectPromptInputPlugin().collect(createCtx(workspace, mockFs))
      const project = result.workspace?.projects.find(p => p.name === PROJECT_NAME)
      expect(project?.childMemoryPrompts).toHaveLength(1)
      expect(project?.childMemoryPrompts?.[0]?.dir.path).toBe(ideaDir)
    })

    it('should scan mixed directories, skipping only node_modules and .git', async () => {
      const workspace = createMockWorkspace()
      const allowedDirs = ['.vscode', '.idea', 'src', 'app']
      const skippedDirs = [SKIP_DIR_NODE_MODULES, SKIP_DIR_GIT]
      const allDirs = [...allowedDirs, ...skippedDirs]
      const mockFs = {
        existsSync: vi.fn().mockImplementation((p: string) => {
          if (p === SHADOW_PROJECTS_DIR || p === SHADOW_PROJECT_PATH) return true
          for (const dir of allowedDirs) {
            if (path.normalize(p) === path.normalize(path.join(SHADOW_PROJECT_PATH, dir, PROJECT_MEMORY_FILE))) return true
          }
          return false
        }),
        statSync: vi.fn().mockReturnValue({isDirectory: () => true, isFile: () => true}),
        readdirSync: vi.fn().mockImplementation((dir: string) => {
          if (path.normalize(dir) === path.normalize(SHADOW_PROJECT_PATH)) return allDirs.map(d => dirEntry(d))
          for (const d of skippedDirs) {
            if (dir.includes(d)) throw new Error(`Should not scan skipped directory: ${d}`)
          }
          return []
        }),
        readFileSync: vi.fn().mockReturnValue(MOCK_MDX_CONTENT)
      }
      const result = await new ProjectPromptInputPlugin().collect(createCtx(workspace, mockFs))
      const project = result.workspace?.projects.find(p => p.name === PROJECT_NAME)
      expect(project?.childMemoryPrompts).toHaveLength(allowedDirs.length)
      const collectedPaths = project?.childMemoryPrompts?.map(c => c.dir.path) ?? []
      for (const dir of allowedDirs) expect(collectedPaths).toContain(dir)
      for (const dir of skippedDirs) expect(collectedPaths).not.toContain(dir)
    })
  })
})
