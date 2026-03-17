import type {InputCapabilityContext, Project, Workspace} from '../plugins/plugin-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import glob from 'fast-glob'
import {describe, expect, it} from 'vitest'
import {mergeConfig} from '../config'
import {createLogger, FilePathKind, WORKSPACE_ROOT_PROJECT_NAME} from '../plugins/plugin-core'
import {ProjectPromptInputCapability} from './input-project-prompt'

function createProject(
  tempWorkspace: string,
  name: string,
  overrides: Partial<Project> = {}
): Project {
  return {
    name,
    dirFromWorkspacePath: {
      pathKind: FilePathKind.Relative,
      path: name,
      basePath: tempWorkspace,
      getDirectoryName: () => name,
      getAbsolutePath: () => path.join(tempWorkspace, name)
    },
    ...overrides
  }
}

function createWorkspace(tempWorkspace: string, projects: readonly Project[] = [createProject(tempWorkspace, 'project-a')]): Workspace {
  return {
    directory: {
      pathKind: FilePathKind.Absolute,
      path: tempWorkspace,
      getDirectoryName: () => path.basename(tempWorkspace),
      getAbsolutePath: () => tempWorkspace
    },
    projects: [...projects]
  }
}

function createContext(tempWorkspace: string, workspace: Workspace = createWorkspace(tempWorkspace)): InputCapabilityContext {
  return {
    logger: createLogger('ProjectPromptInputCapabilityTest', 'error'),
    fs,
    path,
    glob,
    userConfigOptions: mergeConfig({workspaceDir: tempWorkspace}),
    dependencyContext: {
      workspace
    }
  } as InputCapabilityContext
}

describe('project prompt input plugin workspace prompt support', () => {
  it('injects a synthetic workspace project from aindex/dist/workspace.mdx only', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-workspace-prompt-'))
    const workspacePromptPath = path.join(tempWorkspace, 'aindex', 'dist', 'workspace.mdx')

    try {
      fs.mkdirSync(path.dirname(workspacePromptPath), {recursive: true})
      fs.writeFileSync(workspacePromptPath, '---\ndescription: workspace\n---\nWorkspace prompt body', 'utf8')

      const plugin = new ProjectPromptInputCapability()
      const result = await plugin.collect(createContext(tempWorkspace))
      const projects = result.workspace?.projects ?? []
      const workspaceProject = projects.find(project => project.isWorkspaceRootProject === true)

      expect(workspaceProject).toBeDefined()
      expect(workspaceProject?.name).toBe(WORKSPACE_ROOT_PROJECT_NAME)
      expect(workspaceProject?.rootMemoryPrompt?.content).toContain('Workspace prompt body')
      expect(workspaceProject?.childMemoryPrompts).toBeUndefined()
      expect(workspaceProject?.isPromptSourceProject).not.toBe(true)
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('does not fall back to workspace/dist/workspace.mdx when aindex dist prompt is missing', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-workspace-prompt-fallback-'))
    const wrongPromptPath = path.join(tempWorkspace, 'dist', 'workspace.mdx')

    try {
      fs.mkdirSync(path.dirname(wrongPromptPath), {recursive: true})
      fs.writeFileSync(wrongPromptPath, 'Workspace prompt from the wrong place', 'utf8')

      const plugin = new ProjectPromptInputCapability()
      const result = await plugin.collect(createContext(tempWorkspace))
      const projects = result.workspace?.projects ?? []

      expect(projects.some(project => project.isWorkspaceRootProject === true)).toBe(false)
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })

  it('inherits the prompt source project config for the synthetic workspace project', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-workspace-prompt-config-'))
    const workspacePromptPath = path.join(tempWorkspace, 'aindex', 'dist', 'workspace.mdx')
    const promptSourceProjectConfig = {
      includeSeries: ['prompt-source-series'],
      subSeries: {
        skills: ['ship-*']
      }
    }

    try {
      fs.mkdirSync(path.dirname(workspacePromptPath), {recursive: true})
      fs.writeFileSync(workspacePromptPath, 'Workspace prompt body', 'utf8')

      const workspace = createWorkspace(tempWorkspace, [
        createProject(tempWorkspace, 'project-a', {
          projectConfig: {
            includeSeries: ['fallback-series']
          }
        }),
        createProject(tempWorkspace, 'project-b', {
          isPromptSourceProject: true,
          projectConfig: promptSourceProjectConfig
        })
      ])

      const plugin = new ProjectPromptInputCapability()
      const result = await plugin.collect(createContext(tempWorkspace, workspace))
      const workspaceProject = result.workspace?.projects?.find(project => project.isWorkspaceRootProject === true)

      expect(workspaceProject?.projectConfig).toEqual(promptSourceProjectConfig)
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })
})
