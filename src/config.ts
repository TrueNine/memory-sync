import type {
  CollectedInputContext,
  FastCommandPrompt,
  GlobalMemoryPrompt,
  IDEKind,
  InputPlugin,
  InputPluginContext,
  PluginOptions,
  Project,
  ProjectIDEConfigFile,
  SkillPrompt,
  SubAgentPrompt,
  Workspace,
} from '@/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import glob from 'fast-glob'

import { createLogger } from '@/log'
import { FileSystemFastCommandPlugin } from '@/plugins/FileSystemFastCommandPlugin'
import { FileSystemGlobalMemoryPlugin } from '@/plugins/FileSystemGlobalMemoryPlugin'
import { FileSystemIdeConfigPlugin } from '@/plugins/FileSystemIdeConfigPlugin'
import { FileSystemShadowProjectPlugin } from '@/plugins/FileSystemShadowProjectPlugin'
import { FileSystemSkillPlugin } from '@/plugins/FileSystemSkillPlugin'
import { FileSystemSubAgentPlugin } from '@/plugins/FileSystemSubAgentPlugin'
import { FileSystemWorkspacePlugin } from '@/plugins/FileSystemWorkspacePlugin'

export function defineConfig(userOptions: PluginOptions = {}): CollectedInputContext {
  const logger = createLogger('defineConfig')

  const ctx: InputPluginContext = {
    logger,
    userConfigOptions: userOptions,
    fs,
    path,
    glob,
  }

  const plugins: InputPlugin[] = [
    new FileSystemWorkspacePlugin(),
    new FileSystemShadowProjectPlugin(),
    new FileSystemIdeConfigPlugin(),
    new FileSystemSkillPlugin(),
    new FileSystemFastCommandPlugin(),
    new FileSystemSubAgentPlugin(),
    new FileSystemGlobalMemoryPlugin(),
  ]

  const partials = plugins.map((p) => p.collect(ctx))

  return mergeContexts(partials)
}

function mergeContexts(partials: Partial<CollectedInputContext>[]): CollectedInputContext {
  let workspace: Workspace | undefined
  let externalProjects: Project[] = []
  let ideConfigFiles: ProjectIDEConfigFile<IDEKind>[] = []
  let fastCommands: FastCommandPrompt[] = []
  let subAgents: SubAgentPrompt[] = []
  let skills: SkillPrompt[] = []
  let globalMemory: GlobalMemoryPrompt | undefined

  for (const p of partials) {
    if (p.workspace) {
      if (!workspace) {
        // Initial workspace (likely from FileSystemWorkspacePlugin)
        // Ensure we clone the projects array to avoid mutation issues if any
        workspace = {
          ...p.workspace,
          projects: [...p.workspace.projects],
        }
      } else {
        // Merge projects from other plugins (like FileSystemShadowProjectPlugin)
        workspace = {
          ...workspace,
          projects: [...workspace.projects, ...p.workspace.projects],
        }
      }
    }
    if (p.externalProjects) {
      externalProjects = [...externalProjects, ...p.externalProjects]
    }
    if (p.ideConfigFiles) {
      ideConfigFiles = [...ideConfigFiles, ...p.ideConfigFiles]
    }
    if (p.fastCommands) {
      fastCommands = [...fastCommands, ...p.fastCommands]
    }
    if (p.subAgents) {
      subAgents = [...subAgents, ...p.subAgents]
    }
    if (p.skills) {
      skills = [...skills, ...p.skills]
    }
    if (p.globalMemory) {
      globalMemory = p.globalMemory
    }
  }

  if (!workspace) {
    throw new Error('Workspace not initialized by any plugin')
  }

  return {
    workspace,
    ideConfigFiles,
    ...(externalProjects.length > 0 && { externalProjects }),
    ...(fastCommands.length > 0 && { fastCommands }),
    ...(subAgents.length > 0 && { subAgents }),
    ...(skills.length > 0 && { skills }),
    ...(globalMemory !== void 0 && { globalMemory }),
  }
}
