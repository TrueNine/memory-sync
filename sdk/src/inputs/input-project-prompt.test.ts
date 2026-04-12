import type {InputCapabilityContext, Project, Workspace} from '../adaptors/adaptor-core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import glob from 'fast-glob'
import {describe, expect, it} from 'vitest'
import {createLogger, FilePathKind, WORKSPACE_ROOT_PROJECT_NAME} from '../adaptors/adaptor-core'
import {mergeConfig} from '../config'
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

  it('loads ext, arch, and softwares project prompts using the same agt.mdx workflow as app', async () => {
    const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-project-prompt-series-'))
    const extRoot = path.join(tempWorkspace, 'aindex', 'dist', 'ext', 'plugin-a')
    const archRoot = path.join(tempWorkspace, 'aindex', 'dist', 'arch', 'system-a')
    const softwareRoot = path.join(tempWorkspace, 'aindex', 'dist', 'softwares', 'tool-a')

    try {
      fs.mkdirSync(path.join(extRoot, 'docs'), {recursive: true})
      fs.mkdirSync(path.join(archRoot, 'design'), {recursive: true})
      fs.mkdirSync(path.join(softwareRoot, 'manual'), {recursive: true})
      fs.writeFileSync(path.join(extRoot, 'agt.mdx'), 'Ext root prompt', 'utf8')
      fs.writeFileSync(path.join(extRoot, 'docs', 'agt.mdx'), 'Ext child prompt', 'utf8')
      fs.writeFileSync(path.join(archRoot, 'agt.mdx'), 'Arch root prompt', 'utf8')
      fs.writeFileSync(path.join(archRoot, 'design', 'agt.mdx'), 'Arch child prompt', 'utf8')
      fs.writeFileSync(path.join(softwareRoot, 'agt.mdx'), 'Software root prompt', 'utf8')
      fs.writeFileSync(path.join(softwareRoot, 'manual', 'agt.mdx'), 'Software child prompt', 'utf8')

      const workspace = createWorkspace(tempWorkspace, [
        createProject(tempWorkspace, 'plugin-a', {projectType: 'ext'}),
        createProject(tempWorkspace, 'system-a', {projectType: 'arch'}),
        createProject(tempWorkspace, 'tool-a', {projectType: 'softwares'})
      ])

      const plugin = new ProjectPromptInputCapability()
      const result = await plugin.collect(createContext(tempWorkspace, workspace))
      const projects = result.workspace?.projects ?? []
      const extProject = projects.find(project => project.name === 'plugin-a')
      const archProject = projects.find(project => project.name === 'system-a')
      const softwareProject = projects.find(project => project.name === 'tool-a')

      expect(extProject?.rootMemoryPrompt?.content).toContain('Ext root prompt')
      expect(extProject?.childMemoryPrompts?.[0]?.content).toContain('Ext child prompt')
      expect(archProject?.rootMemoryPrompt?.content).toContain('Arch root prompt')
      expect(archProject?.childMemoryPrompts?.[0]?.content).toContain('Arch child prompt')
      expect(softwareProject?.rootMemoryPrompt?.content).toContain('Software root prompt')
      expect(softwareProject?.childMemoryPrompts?.[0]?.content).toContain('Software child prompt')
    }
    finally {
      fs.rmSync(tempWorkspace, {recursive: true, force: true})
    }
  })
})
