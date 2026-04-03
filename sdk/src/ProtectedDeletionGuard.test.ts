import * as os from 'node:os'
import * as path from 'node:path'
import {describe, expect, it} from 'vitest'
import {
  collectConfiguredAindexInputRules,
  collectKnownAindexInputConfigPaths,
  createProtectedDeletionGuard,
  getProtectedPathViolation,
  partitionDeletionTargets
} from './ProtectedDeletionGuard'

describe('protected deletion guard root protections', () => {
  it('allows deleting descendants under aindex while still protecting the aindex root', () => {
    const workspaceDir = path.join(os.tmpdir(), 'tnmsc-guard-workspace')
    const aindexDir = path.join(workspaceDir, 'aindex')
    const aindexDescendant = path.join(aindexDir, 'app', 'demo', 'backend', 'sql')
    const guard = createProtectedDeletionGuard({
      workspaceDir,
      aindexDir,
      includeReservedWorkspaceContentRoots: true
    })

    expect(getProtectedPathViolation(aindexDescendant, guard)).toBeUndefined()

    const aindexRootViolation = getProtectedPathViolation(aindexDir, guard)
    expect(aindexRootViolation).toBeDefined()
    expect(aindexRootViolation?.protectedPath).toBe(aindexDir)
  })

  it('keeps blocking destructive root-level targets', () => {
    const homeDir = os.homedir()
    const workspaceDir = path.join(homeDir, 'tnmsc-guard-workspace')
    const aindexDir = path.join(workspaceDir, 'aindex')
    const rawXdgConfigHome = process.env['XDG_CONFIG_HOME']
    const xdgConfigHome = rawXdgConfigHome != null && rawXdgConfigHome.trim().length > 0 ? rawXdgConfigHome : path.join(homeDir, '.config')
    const guard = createProtectedDeletionGuard({
      workspaceDir,
      aindexDir
    })

    expect(getProtectedPathViolation(workspaceDir, guard)).toBeDefined()
    expect(getProtectedPathViolation(path.parse(homeDir).root, guard)).toBeDefined()
    expect(getProtectedPathViolation(homeDir, guard)).toBeDefined()
    expect(getProtectedPathViolation(xdgConfigHome, guard)).toBeDefined()
  })
})

describe('aindex descendant deletion regression', () => {
  const testCases = [
    {series: 'dist', subPath: 'commands/demo.mdx'},
    {series: 'dist', subPath: 'ext/plugin-a/agt.mdx'},
    {series: 'dist', subPath: 'arch/system-a/agt.mdx'},
    {series: 'dist', subPath: 'softwares/tool-a/agt.mdx'},
    {series: 'dist', subPath: 'subagents/qa/boot.mdx'},
    {series: 'app', subPath: 'demo/backend/sql/migration.sql'},
    {series: 'ext', subPath: 'plugin-a/agt.src.mdx'},
    {series: 'arch', subPath: 'system-a/agt.src.mdx'},
    {series: 'softwares', subPath: 'tool-a/agt.src.mdx'},
    {series: 'commands', subPath: 'demo.src.mdx'},
    {series: 'subagents', subPath: 'qa/boot.src.mdx'}
  ]

  for (const {series, subPath} of testCases) {
    it(`allows deleting ${series}/${subPath}`, () => {
      const workspaceDir = path.join(os.tmpdir(), `tnmsc-guard-${series}`)
      const aindexDir = path.join(workspaceDir, 'aindex')
      const targetPath = path.join(aindexDir, series, subPath)
      const guard = createProtectedDeletionGuard({workspaceDir, aindexDir})

      expect(getProtectedPathViolation(targetPath, guard)).toBeUndefined()
    })
  }

  it('blocks deleting the entire aindex directory', () => {
    const workspaceDir = path.join(os.tmpdir(), 'tnmsc-guard-root-block')
    const aindexDir = path.join(workspaceDir, 'aindex')
    const guard = createProtectedDeletionGuard({workspaceDir, aindexDir})

    const violation = getProtectedPathViolation(aindexDir, guard)
    expect(violation).toBeDefined()
    expect(violation?.protectedPath).toBe(aindexDir)
    expect(violation?.source).toBe('aindex-root')
  })

  it('blocks deleting workspace root', () => {
    const workspaceDir = path.join(os.tmpdir(), 'tnmsc-guard-ws-root')
    const aindexDir = path.join(workspaceDir, 'aindex')
    const guard = createProtectedDeletionGuard({workspaceDir, aindexDir})

    const violation = getProtectedPathViolation(workspaceDir, guard)
    expect(violation).toBeDefined()
    expect(violation?.source).toBe('workspace-reserved')
  })

  it('blocks deleting project roots inside workspace', () => {
    const workspaceDir = path.join(os.tmpdir(), 'tnmsc-guard-projects')
    const aindexDir = path.join(workspaceDir, 'aindex')
    const projectRoot = path.join(workspaceDir, 'packages', 'my-lib')
    const guard = createProtectedDeletionGuard({
      workspaceDir,
      aindexDir,
      projectRoots: [projectRoot]
    })

    expect(getProtectedPathViolation(projectRoot, guard)).toBeDefined()
  })
})

describe('collectConfiguredAindexInputRules returns empty', () => {
  it('returns empty array regardless of plugin options', () => {
    const mockPluginOptions = {
      aindex: {
        commands: {src: 'src/commands'},
        subAgents: {src: 'src/subagents'},
        globalPrompt: {src: 'global-prompt.src.mdx'},
        workspacePrompt: {src: 'workspace-prompt.src.mdx'}
      }
    } as unknown as Required<Parameters<typeof collectConfiguredAindexInputRules>[0]>

    const rules = collectConfiguredAindexInputRules(mockPluginOptions, '/tmp/aindex', {workspaceDir: '/tmp/workspace'})
    expect(rules).toEqual([])
  })

  it('does not add protections for configured aindex source directories', () => {
    const workspaceDir = path.join(os.tmpdir(), 'tnmsc-guard-config-rules')
    const aindexDir = path.join(workspaceDir, 'aindex')
    const guard = createProtectedDeletionGuard({workspaceDir, aindexDir})

    const commandsSrc = path.join(aindexDir, 'src', 'commands')
    expect(getProtectedPathViolation(commandsSrc, guard)).toBeUndefined()
  })
})

describe('collectKnownAindexInputConfigPaths returns empty', () => {
  it('returns empty array regardless of parameters', () => {
    const paths = collectKnownAindexInputConfigPaths('/tmp/aindex', {workspaceDir: '/tmp/workspace'})
    expect(paths).toEqual([])
  })
})

describe('partitionDeletionTargets with simplified aindex rules', () => {
  it('marks aindex descendants as safe and aindex root as violation', () => {
    const workspaceDir = path.join(os.tmpdir(), 'tnmsc-guard-partition')
    const aindexDir = path.join(workspaceDir, 'aindex')
    const guard = createProtectedDeletionGuard({workspaceDir, aindexDir})

    const targets = [
      path.join(aindexDir, 'dist', 'commands', 'orphan.mdx'),
      path.join(aindexDir, 'app', 'demo'),
      aindexDir,
      path.join(workspaceDir, 'aindex', 'ext', 'plugin-a')
    ]

    const {safePaths, violations} = partitionDeletionTargets(targets, guard)

    expect(safePaths).toContain(path.resolve(path.join(aindexDir, 'dist', 'commands', 'orphan.mdx')))
    expect(safePaths).toContain(path.resolve(path.join(aindexDir, 'app', 'demo')))
    expect(safePaths).toContain(path.resolve(path.join(aindexDir, 'ext', 'plugin-a')))
    expect(violations).toHaveLength(1)
    const violation = violations[0]
    if (violation === void 0) throw new Error('expected violation')
    expect(violation.targetPath).toBe(path.resolve(aindexDir))
    expect(violation.protectedPath).toBe(path.resolve(aindexDir))
  })
})

describe('includeReservedWorkspaceContentRoots parameter is inert', () => {
  it('produces identical rules regardless of includeReservedWorkspaceContentRoots value', () => {
    const workspaceDir = path.join(os.tmpdir(), 'tnmsc-guard-inert-param')
    const aindexDir = path.join(workspaceDir, 'aindex')

    const guardWithContent = createProtectedDeletionGuard({
      workspaceDir,
      aindexDir,
      includeReservedWorkspaceContentRoots: true
    })

    const guardWithoutContent = createProtectedDeletionGuard({
      workspaceDir,
      aindexDir,
      includeReservedWorkspaceContentRoots: false
    })

    expect(guardWithContent.compiledRules).toEqual(guardWithoutContent.compiledRules)
    expect(guardWithContent.exactProtectedPaths).toEqual(guardWithoutContent.exactProtectedPaths)
    expect(guardWithContent.subtreeProtectedPaths).toEqual(guardWithoutContent.subtreeProtectedPaths)
  })
})
