import type {ILogger, InputPluginContext, PluginOptions} from '@truenine/plugin-shared'
import * as path from 'node:path'
import * as fc from 'fast-check'
import {describe, expect, it, vi} from 'vitest'
import {ShadowProjectInputPlugin} from './ShadowProjectInputPlugin'

const W = '/workspace'
const SHADOW = 'shadow'
const SHADOW_DIR = path.join(W, SHADOW)
const DIST_APP = path.join(SHADOW_DIR, 'dist/app')
const SRC_APP = path.join(SHADOW_DIR, 'app')

function mockLogger(): ILogger {
  return {debug: vi.fn(), trace: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()} as unknown as ILogger
}

function mockOptions(): Required<PluginOptions> {
  return {
    workspaceDir: W,
    shadowSourceProject: {
      name: SHADOW,
      skill: {src: 'src/skills', dist: 'dist/skills'},
      fastCommand: {src: 'src/commands', dist: 'dist/commands'},
      subAgent: {src: 'src/agents', dist: 'dist/agents'},
      rule: {src: 'src/rules', dist: 'dist/rules'},
      globalMemory: {src: 'app/global.cn.mdx', dist: 'dist/global.mdx'},
      workspaceMemory: {src: 'app/workspace.cn.mdx', dist: 'dist/app/workspace.mdx'},
      project: {src: 'app', dist: 'dist/app'}
    },
    fastCommandSeriesOptions: {},
    plugins: [],
    logLevel: 'info'
  } as never
}

function projectJsoncPath(name: string): string {
  return path.join(SRC_APP, name, 'project.jsonc')
}

function makeDirEntry(name: string) {
  return {name, isDirectory: () => true, isFile: () => false}
}

function createCtx(mockFs: unknown, logger = mockLogger()): InputPluginContext {
  return {
    logger,
    fs: mockFs as typeof import('node:fs'),
    path,
    glob: vi.fn() as never,
    userConfigOptions: mockOptions(),
    dependencyContext: {},
    globalScope: void 0 as never
  }
}

function buildMockFs(projectName: string, jsoncContent: string | null) {
  const jsoncPath = projectJsoncPath(projectName)
  return {
    existsSync: vi.fn((p: string) => {
      if (p === DIST_APP) return true
      if (p === jsoncPath) return jsoncContent != null
      return false
    }),
    statSync: vi.fn(() => ({isDirectory: () => true})),
    readdirSync: vi.fn((p: string) => p === DIST_APP ? [makeDirEntry(projectName)] : []),
    readFileSync: vi.fn((p: string) => {
      if (p === jsoncPath && jsoncContent != null) return jsoncContent
      throw new Error(`unexpected readFileSync: ${p}`)
    })
  }
}

describe('shadowProjectInputPlugin - project.jsonc loading', () => {
  it('attaches projectConfig when project.jsonc exists', () => {
    const config = {rules: {includeSeries: ['uniapp3']}}
    const mockFs = buildMockFs('my-project', JSON.stringify(config))
    const result = new ShadowProjectInputPlugin().collect(createCtx(mockFs))
    const project = result.workspace?.projects.find(p => p.name === 'my-project')
    expect(project?.projectConfig).toEqual(config)
  })

  it('leaves projectConfig undefined when project.jsonc is absent', () => {
    const mockFs = buildMockFs('my-project', null)
    const result = new ShadowProjectInputPlugin().collect(createCtx(mockFs))
    const project = result.workspace?.projects.find(p => p.name === 'my-project')
    expect(project?.projectConfig).toBeUndefined()
  })

  it('parses JSONC with comments correctly', () => {
    const jsonc = '{\n  // enable uniapp rules\n  "rules": {"includeSeries": ["uniapp3"]}\n}'
    const mockFs = buildMockFs('proj', jsonc)
    const result = new ShadowProjectInputPlugin().collect(createCtx(mockFs))
    expect(result.workspace?.projects[0]?.projectConfig?.rules?.includeSeries).toEqual(['uniapp3'])
  })

  it('leaves projectConfig undefined and warns on malformed JSONC', () => {
    const logger = mockLogger()
    const mockFs = buildMockFs('proj', '{invalid json{{')
    const result = new ShadowProjectInputPlugin().collect(createCtx(mockFs, logger))
    expect(result.workspace?.projects[0]?.projectConfig).toBeUndefined()
  })

  it('attaches mcp.names from project.jsonc', () => {
    const config = {mcp: {names: ['context7', 'deepwiki']}}
    const mockFs = buildMockFs('proj', JSON.stringify(config))
    const result = new ShadowProjectInputPlugin().collect(createCtx(mockFs))
    expect(result.workspace?.projects[0]?.projectConfig?.mcp?.names).toEqual(['context7', 'deepwiki'])
  })

  it('attaches rules.subSeries from project.jsonc', () => {
    const config = {rules: {subSeries: {backend: ['api-rules'], frontend: ['vue-rules']}}}
    const mockFs = buildMockFs('proj', JSON.stringify(config))
    const result = new ShadowProjectInputPlugin().collect(createCtx(mockFs))
    expect(result.workspace?.projects[0]?.projectConfig?.rules?.subSeries).toEqual(config.rules.subSeries)
  })

  it('does not affect other project fields when project.jsonc is absent', () => {
    const mockFs = buildMockFs('proj', null)
    const result = new ShadowProjectInputPlugin().collect(createCtx(mockFs))
    const p = result.workspace?.projects[0]
    expect(p?.name).toBe('proj')
    expect(p?.dirFromWorkspacePath).toBeDefined()
    expect(p?.projectConfig).toBeUndefined()
  })

  it('handles empty project.jsonc object', () => {
    const mockFs = buildMockFs('proj', '{}')
    const result = new ShadowProjectInputPlugin().collect(createCtx(mockFs))
    expect(result.workspace?.projects[0]?.projectConfig).toEqual({})
  })
})

describe('shadowProjectInputPlugin - project.jsonc property tests', () => {
  const projectNameGen = fc.stringMatching(/^[a-z][a-z0-9-]{0,19}$/)
  const stringArrayGen = fc.array(fc.string({minLength: 1, maxLength: 20}), {maxLength: 5})

  it('projectConfig is always attached when project.jsonc exists with valid JSON', () => {
    fc.assert(fc.property(projectNameGen, stringArrayGen, (name, include) => {
      const config = {rules: {include}}
      const mockFs = buildMockFs(name, JSON.stringify(config))
      const result = new ShadowProjectInputPlugin().collect(createCtx(mockFs))
      const project = result.workspace?.projects.find(p => p.name === name)
      expect(project?.projectConfig?.rules?.include).toEqual(include)
    }))
  })

  it('projectConfig is always undefined when project.jsonc is absent', () => {
    fc.assert(fc.property(projectNameGen, name => {
      const mockFs = buildMockFs(name, null)
      const result = new ShadowProjectInputPlugin().collect(createCtx(mockFs))
      const project = result.workspace?.projects.find(p => p.name === name)
      expect(project?.projectConfig).toBeUndefined()
    }))
  })

  it('project name is always preserved regardless of projectConfig presence', () => {
    fc.assert(fc.property(projectNameGen, fc.boolean(), (name, hasConfig) => {
      const mockFs = buildMockFs(name, hasConfig ? '{"mcp": {"names": []}}' : null)
      const result = new ShadowProjectInputPlugin().collect(createCtx(mockFs))
      const project = result.workspace?.projects.find(p => p.name === name)
      expect(project?.name).toBe(name)
    }))
  })
})
