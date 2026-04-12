import type {OutputCollectedContext, Project} from './adaptors/adaptor-core'
import * as path from 'node:path'
import {describe, expect, it} from 'vitest'
import {FilePathKind} from './adaptors/adaptor-core'
import {filterPathScopedEntriesForExecutionPlan, resolveExecutionPlan} from './execution-plan'

function createProject(workspaceDir: string, name: string, series: Project['projectType']): Project {
  return {
    name,
    projectType: series,
    dirFromWorkspacePath: {
      pathKind: FilePathKind.Relative,
      path: name,
      basePath: workspaceDir,
      getDirectoryName: () => name,
      getAbsolutePath: () => path.join(workspaceDir, name)
    }
  }
}

function createContext(workspaceDir: string): OutputCollectedContext {
  return {
    workspace: {
      directory: {
        pathKind: FilePathKind.Absolute,
        path: workspaceDir,
        getDirectoryName: () => path.basename(workspaceDir)
      },
      projects: [
        createProject(workspaceDir, 'app-one', 'app'),
        createProject(workspaceDir, 'plugin-one', 'ext'),
        createProject(workspaceDir, 'system-one', 'arch'),
        createProject(workspaceDir, 'tool-one', 'softwares')
      ]
    }
  }
}

describe('execution plan resolution', () => {
  it('resolves workspace scope only when cwd exactly matches workspaceDir', () => {
    const workspaceDir = path.resolve('/tmp/tnmsc-execution-plan-workspace')
    const context = createContext(workspaceDir)

    const result = resolveExecutionPlan(context, workspaceDir)

    expect(result.scope).toBe('workspace')
  })

  it('resolves project scope for a managed project root and nested path', () => {
    const workspaceDir = path.resolve('/tmp/tnmsc-execution-plan-project')
    const context = createContext(workspaceDir)

    const nestedPath = path.join(workspaceDir, 'plugin-one', 'docs', 'nested')
    const result = resolveExecutionPlan(context, nestedPath)

    expect(result.scope).toBe('project')
    expect(result.scope === 'project' ? result.matchedProject.name : void 0).toBe('plugin-one')
    expect(result.scope === 'project' ? result.matchedProject.projectType : void 0).toBe('ext')
  })

  it('resolves unsupported scope for a workspace subdirectory outside managed projects', () => {
    const workspaceDir = path.resolve('/tmp/tnmsc-execution-plan-unsupported')
    const context = createContext(workspaceDir)

    const result = resolveExecutionPlan(context, path.join(workspaceDir, 'scripts'))

    expect(result.scope).toBe('unsupported')
  })

  it('resolves external scope outside the workspace tree', () => {
    const workspaceDir = path.resolve('/tmp/tnmsc-execution-plan-external')
    const context = createContext(workspaceDir)

    const result = resolveExecutionPlan(context, path.resolve('/tmp/another-location'))

    expect(result.scope).toBe('external')
    expect(result.projectsByType.app.map(project => project.name)).toEqual(['app-one'])
    expect(result.projectsByType.softwares.map(project => project.name)).toEqual(['tool-one'])
  })
})

describe('execution-scoped entry filtering', () => {
  it('keeps only workspace and global entries in workspace mode', () => {
    const workspaceDir = path.resolve('/tmp/tnmsc-execution-filter-workspace')
    const context = createContext(workspaceDir)
    const plan = resolveExecutionPlan(context, workspaceDir)
    const entries = [
      {path: path.join(workspaceDir, 'WARP.md'), scope: 'project'},
      {path: path.join(workspaceDir, 'app-one', 'AGENTS.md'), scope: 'project'},
      {path: path.join(workspaceDir, 'plugin-one', 'WARP.md'), scope: 'project'},
      {path: path.resolve('/tmp/global-config/CODEX.md'), scope: 'global'}
    ] as const

    const filtered = filterPathScopedEntriesForExecutionPlan(entries, plan, context)

    expect(filtered).toEqual([
      {path: path.join(workspaceDir, 'WARP.md'), scope: 'project'},
      {path: path.resolve('/tmp/global-config/CODEX.md'), scope: 'global'}
    ])
  })

  it('keeps only the matched project and global entries in project mode, including Warp-style project outputs', () => {
    const workspaceDir = path.resolve('/tmp/tnmsc-execution-filter-project')
    const context = createContext(workspaceDir)
    const plan = resolveExecutionPlan(context, path.join(workspaceDir, 'plugin-one', 'nested'))
    const entries = [
      {path: path.join(workspaceDir, 'WARP.md'), scope: 'project'},
      {path: path.join(workspaceDir, 'plugin-one', 'WARP.md'), scope: 'project'},
      {path: path.join(workspaceDir, 'plugin-one', 'docs', 'WARP.md'), scope: 'project'},
      {path: path.join(workspaceDir, 'app-one', 'AGENTS.md'), scope: 'project'},
      {path: path.resolve('/tmp/global-config/CODEX.md'), scope: 'global'}
    ] as const

    const filtered = filterPathScopedEntriesForExecutionPlan(entries, plan, context)

    expect(filtered).toEqual([
      {path: path.join(workspaceDir, 'plugin-one', 'WARP.md'), scope: 'project'},
      {path: path.join(workspaceDir, 'plugin-one', 'docs', 'WARP.md'), scope: 'project'},
      {path: path.resolve('/tmp/global-config/CODEX.md'), scope: 'global'}
    ])
  })

  it('keeps workspace, project, and global entries in external mode', () => {
    const workspaceDir = path.resolve('/tmp/tnmsc-execution-filter-external')
    const context = createContext(workspaceDir)
    const plan = resolveExecutionPlan(context, path.resolve('/tmp/outside-workspace'))
    const entries = [
      {path: path.join(workspaceDir, 'WARP.md'), scope: 'project'},
      {path: path.join(workspaceDir, 'plugin-one', 'WARP.md'), scope: 'project'},
      {path: path.join(workspaceDir, 'app-one', 'AGENTS.md'), scope: 'project'},
      {path: path.resolve('/tmp/global-config/CODEX.md'), scope: 'global'}
    ] as const

    const filtered = filterPathScopedEntriesForExecutionPlan(entries, plan, context)

    expect(filtered).toEqual(entries)
  })
})
