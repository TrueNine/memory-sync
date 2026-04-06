import type {OutputCleanContext, Project} from './plugin-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import glob from 'fast-glob'
import {describe, expect, it} from 'vitest'
import {collectDeletionTargets} from '@/commands/CleanupUtils'
import {KiroCLIOutputPlugin} from './KiroCLIOutputPlugin'
import {createLogger, FilePathKind} from './plugin-core'

class TestKiroCLIOutputPlugin extends KiroCLIOutputPlugin {
  constructor(private readonly testHomeDir: string) {
    super()
  }

  protected override getHomeDir(): string {
    return this.testHomeDir
  }
}

function createProject(workspaceBase: string, name: string): Project {
  return {
    name,
    dirFromWorkspacePath: {
      pathKind: FilePathKind.Relative,
      path: name,
      basePath: workspaceBase,
      getDirectoryName: () => name,
      getAbsolutePath: () => path.join(workspaceBase, name)
    }
  } as Project
}

function createWorkspaceRootProject(): Project {
  return {
    name: '__workspace__',
    isWorkspaceRootProject: true
  } as Project
}

function createCleanContext(
  workspaceBase: string,
  projects: readonly Project[]
): OutputCleanContext {
  return {
    logger: createLogger('KiroCLIOutputPlugin', 'error'),
    fs,
    path,
    glob,
    dryRun: true,
    runtimeTargets: {jetbrainsCodexDirs: []},
    collectedOutputContext: {
      workspace: {
        directory: {
          pathKind: FilePathKind.Absolute,
          path: workspaceBase,
          getDirectoryName: () => path.basename(workspaceBase)
        },
        projects: [...projects]
      }
    }
  } as unknown as OutputCleanContext
}

describe('kiroCLIOutputPlugin cleanup', () => {
  it('plans cleanup for configured Kiro streening, specs, and nested mcp paths', async () => {
    const tempHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-kiro-home-'))
    const workspaceBase = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-kiro-workspace-'))
    const projectName = 'consumer-app'
    const projectDir = path.join(workspaceBase, projectName)
    const globalStreeningFile = path.join(tempHomeDir, '.kiro', 'streening', 'global.json')
    const projectRootStreeningFile = path.join(projectDir, '.kiro', 'streening', 'project.json')
    const nestedProjectStreeningFile = path.join(projectDir, 'packages', 'feature', '.kiro', 'streening', 'nested.json')
    const nestedProjectMcpFile = path.join(projectDir, 'packages', 'feature', '.kiro', 'settings', 'mcp.json')
    const nestedProjectSpecFile = path.join(projectDir, 'packages', 'feature', '.kiro', 'specs', 'plan.md')

    fs.mkdirSync(path.dirname(globalStreeningFile), {recursive: true})
    fs.mkdirSync(path.dirname(projectRootStreeningFile), {recursive: true})
    fs.mkdirSync(path.dirname(nestedProjectStreeningFile), {recursive: true})
    fs.mkdirSync(path.dirname(nestedProjectMcpFile), {recursive: true})
    fs.mkdirSync(path.dirname(nestedProjectSpecFile), {recursive: true})
    fs.writeFileSync(globalStreeningFile, '{}\n', 'utf8')
    fs.writeFileSync(projectRootStreeningFile, '{}\n', 'utf8')
    fs.writeFileSync(nestedProjectStreeningFile, '{}\n', 'utf8')
    fs.writeFileSync(nestedProjectMcpFile, '{}\n', 'utf8')
    fs.writeFileSync(nestedProjectSpecFile, '# spec\n', 'utf8')

    try {
      const plugin = new TestKiroCLIOutputPlugin(tempHomeDir)
      const cleanup = await plugin.declareCleanupPaths(
        createCleanContext(workspaceBase, [createProject(workspaceBase, projectName)])
      )
      const deletePaths = cleanup.delete?.map(target => target.path.replaceAll('\\', '/')) ?? []
      const plan = await collectDeletionTargets(
        [plugin],
        createCleanContext(workspaceBase, [createProject(workspaceBase, projectName)])
      )
      const normalizedFilesToDelete = plan.filesToDelete.map(target => target.replaceAll('\\', '/'))
      const normalizedDirsToDelete = plan.dirsToDelete.map(target => target.replaceAll('\\', '/'))

      expect(deletePaths).toContain(path.join(tempHomeDir, '.kiro', 'streening').replaceAll('\\', '/'))
      expect(deletePaths).toContain(path.join(projectDir, '.kiro', 'streening').replaceAll('\\', '/'))
      expect(deletePaths).toContain(path.join(projectDir, '**', '.kiro', 'streening').replaceAll('\\', '/'))
      expect(deletePaths).toContain(path.join(projectDir, '**', '.kiro', 'specs').replaceAll('\\', '/'))
      expect(deletePaths).toContain(path.join(projectDir, '**', '.kiro', 'settings', 'mcp.json').replaceAll('\\', '/'))
      expect(normalizedFilesToDelete).toContain(nestedProjectMcpFile.replaceAll('\\', '/'))
      expect(normalizedDirsToDelete).toContain(path.dirname(globalStreeningFile).replaceAll('\\', '/'))
      expect(normalizedDirsToDelete).toContain(path.dirname(projectRootStreeningFile).replaceAll('\\', '/'))
      expect(normalizedDirsToDelete).toContain(path.dirname(nestedProjectStreeningFile).replaceAll('\\', '/'))
      expect(normalizedDirsToDelete).toContain(path.dirname(nestedProjectSpecFile).replaceAll('\\', '/'))
      expect(plan.violations).toEqual([])
    } finally {
      fs.rmSync(tempHomeDir, {recursive: true, force: true})
      fs.rmSync(workspaceBase, {recursive: true, force: true})
    }
  })

  it('plans cleanup for workspace-root .kiro paths', async () => {
    const tempHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-kiro-home-root-'))
    const workspaceBase = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-kiro-workspace-root-'))
    const workspaceStreeningFile = path.join(workspaceBase, '.kiro', 'streening', 'root.json')
    const workspaceMcpFile = path.join(workspaceBase, '.kiro', 'settings', 'mcp.json')
    const workspaceSpecFile = path.join(workspaceBase, '.kiro', 'specs', 'plan.md')

    fs.mkdirSync(path.dirname(workspaceStreeningFile), {recursive: true})
    fs.mkdirSync(path.dirname(workspaceMcpFile), {recursive: true})
    fs.mkdirSync(path.dirname(workspaceSpecFile), {recursive: true})
    fs.writeFileSync(workspaceStreeningFile, '{}\n', 'utf8')
    fs.writeFileSync(workspaceMcpFile, '{}\n', 'utf8')
    fs.writeFileSync(workspaceSpecFile, '# spec\n', 'utf8')

    try {
      const plugin = new TestKiroCLIOutputPlugin(tempHomeDir)
      const cleanup = await plugin.declareCleanupPaths(
        createCleanContext(workspaceBase, [createWorkspaceRootProject()])
      )
      const deletePaths = cleanup.delete?.map(target => target.path.replaceAll('\\', '/')) ?? []
      const plan = await collectDeletionTargets(
        [plugin],
        createCleanContext(workspaceBase, [createWorkspaceRootProject()])
      )
      const normalizedFilesToDelete = plan.filesToDelete.map(target => target.replaceAll('\\', '/'))
      const normalizedDirsToDelete = plan.dirsToDelete.map(target => target.replaceAll('\\', '/'))

      expect(deletePaths).toContain(path.join(workspaceBase, '.kiro', 'streening').replaceAll('\\', '/'))
      expect(deletePaths).toContain(path.join(workspaceBase, '.kiro', 'specs').replaceAll('\\', '/'))
      expect(deletePaths).toContain(path.join(workspaceBase, '.kiro', 'settings', 'mcp.json').replaceAll('\\', '/'))
      expect(normalizedFilesToDelete).toContain(workspaceMcpFile.replaceAll('\\', '/'))
      expect(normalizedDirsToDelete).toContain(path.dirname(workspaceStreeningFile).replaceAll('\\', '/'))
      expect(normalizedDirsToDelete).toContain(path.dirname(workspaceSpecFile).replaceAll('\\', '/'))
      expect(plan.violations).toEqual([])
    } finally {
      fs.rmSync(tempHomeDir, {recursive: true, force: true})
      fs.rmSync(workspaceBase, {recursive: true, force: true})
    }
  })
})
