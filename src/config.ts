import type {
  CollectedInputContext,
  FastCommandPrompt,
  FastCommandYAMLFrontMatter,
  PluginOptions,
  Project,
  ProjectIDEConfigFile,
  SkillPrompt,
  SkillYAMLFrontMatter,
  SubAgentPrompt,
  SubAgentYAMLFrontMatter,
  Workspace,
} from '@/types'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  DEFAULT_GLOBAL_MEMORY_FILE,
  DEFAULT_SHADOW_FAST_COMMAND_DIR,
  DEFAULT_SHADOW_PROJECT_SUFFIX,
  DEFAULT_SHADOW_SKILL_SOURCE_DIR,
  DEFAULT_SHADOW_SOURCE_PROJECT_DIR,
  DEFAULT_SHADOW_SUB_AGENT_DIR,
  DEFAULT_WORKSPACE_DIR,
  PathPlaceholders,
} from '@/constants'
import { parseMarkdown } from '@/markdown'
import { FilePathKind, GlobalConfigDirectoryType, IDEKind, PromptKind } from '@/types'

const PLACEHOLDER_USER_HOME = PathPlaceholders.USER_HOME
const PLACEHOLDER_SHADOW_PROJECT = PathPlaceholders.SHADOW_PROJECT
const PLACEHOLDER_WORKSPACE = PathPlaceholders.WORKSPACE

function resolvePath(
  rawPath: string,
  workspaceDir: string,
  shadowProjectDir: string,
): string {
  let resolved = rawPath

  if (resolved.startsWith(PLACEHOLDER_USER_HOME)) {
    resolved = resolved.replace(PLACEHOLDER_USER_HOME, os.homedir())
  }

  if (resolved.includes(PLACEHOLDER_SHADOW_PROJECT)) {
    resolved = resolved.replace(PLACEHOLDER_SHADOW_PROJECT, shadowProjectDir)
  }

  if (resolved.includes(PLACEHOLDER_WORKSPACE)) {
    resolved = resolved.replace(PLACEHOLDER_WORKSPACE, workspaceDir)
  }

  return path.normalize(resolved)
}

export function defineConfig(userOptions: PluginOptions = {}): CollectedInputContext {
  const options = { ...userOptions }

  const workspaceDirRaw = options.workspaceDir ?? DEFAULT_WORKSPACE_DIR
  const workspaceDir = resolvePath(workspaceDirRaw, '', '')

  const shadowProjectDirRaw = options.shadowProjectDir ?? `${PLACEHOLDER_WORKSPACE}/${DEFAULT_SHADOW_PROJECT_SUFFIX}`
  const shadowProjectDir = resolvePath(shadowProjectDirRaw, workspaceDir, '')

  const shadowSourceProjectDirRaw = options.shadowSourceProjectDir ?? DEFAULT_SHADOW_SOURCE_PROJECT_DIR
  const shadowSourceProjectDir = resolvePath(shadowSourceProjectDirRaw, workspaceDir, shadowProjectDir)

  // Scan shadow source projects
  const shadowProjects: Project[] = []
  if (fs.existsSync(shadowSourceProjectDir) && fs.statSync(shadowSourceProjectDir).isDirectory()) {
    try {
      const entries = fs.readdirSync(shadowSourceProjectDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          shadowProjects.push({
            name: entry.name,
            dirFromWorkspacePath: {
              pathKind: FilePathKind.Relative,
              path: entry.name,
              basePath: workspaceDir,
              getDirectoryName: () => entry.name,
              getAbsolutePath: () => path.resolve(workspaceDir, entry.name),
            },
          })
        }
      }
    } catch (e) {
      console.error(`Failed to scan shadow source projects at ${shadowSourceProjectDir}`, e)
    }
  }

  const defaultIdeFiles = [
    '.editorconfig',
    '.idea/codeStyles/Project.xml',
    '.idea/codeStyles/codeStyleConfig.xml',
    '.idea/.gitignore',
    '.vscode/settings.json',
    '.vscode/extensions.json',
  ]

  const ideConfigFiles: ProjectIDEConfigFile<IDEKind>[] = []

  for (const relativePath of defaultIdeFiles) {
    const absPath = path.join(shadowProjectDir, relativePath)
    if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
      const content = fs.readFileSync(absPath, 'utf-8')
      let type: IDEKind = IDEKind.Original
      if (relativePath.includes('.vscode')) {
        type = IDEKind.VSCode
      } else if (relativePath.includes('.idea')) {
        type = IDEKind.IntellijIDEA
      } else if (relativePath.includes('.editorconfig')) {
        type = IDEKind.EditorConfig
      }

      ideConfigFiles.push({
        type,
        content,
        length: content.length,
        filePathKind: FilePathKind.Absolute,
        dir: {
          pathKind: FilePathKind.Absolute,
          path: absPath,
          getDirectoryName: () => path.basename(absPath),
        },
      })
    }
  }

  const externalProjects = (options.externalProjects || []).map((p) => {
    const resolved = resolvePath(p, workspaceDir, shadowProjectDir)
    return {
      name: path.basename(resolved),
      dirFromWorkspacePath: {
        pathKind: FilePathKind.Relative,
        path: resolved,
        basePath: workspaceDir,
        getDirectoryName: () => path.basename(resolved),
      },
    } as Project
  })

  // Resolve additional directories
  const skillDirRaw = options.shadowSkillSourceDir ?? DEFAULT_SHADOW_SKILL_SOURCE_DIR
  const skillDir = resolvePath(skillDirRaw, workspaceDir, shadowProjectDir)

  const fastCommandDirRaw = options.shadowFastCommandDir ?? DEFAULT_SHADOW_FAST_COMMAND_DIR
  const fastCommandDir = resolvePath(fastCommandDirRaw, workspaceDir, shadowProjectDir)

  const subAgentDirRaw = options.shadowSubAgentDir ?? DEFAULT_SHADOW_SUB_AGENT_DIR
  const subAgentDir = resolvePath(subAgentDirRaw, workspaceDir, shadowProjectDir)

  const globalMemoryFileRaw = options.globalMemoryFile ?? DEFAULT_GLOBAL_MEMORY_FILE
  const globalMemoryFile = resolvePath(globalMemoryFileRaw, workspaceDir, shadowProjectDir)

  // Collect skills
  const skills: SkillPrompt[] = []
  if (fs.existsSync(skillDir) && fs.statSync(skillDir).isDirectory()) {
    try {
      const entries = fs.readdirSync(skillDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillFilePath = path.join(skillDir, entry.name, 'SKILL.md')
          if (fs.existsSync(skillFilePath) && fs.statSync(skillFilePath).isFile()) {
            const rawContent = fs.readFileSync(skillFilePath, 'utf-8')
            const parsed = parseMarkdown<SkillYAMLFrontMatter>(rawContent)
            const content = parsed.contentWithoutFrontMatter
            skills.push({
              type: PromptKind.Skill,
              content,
              length: content.length,
              filePathKind: FilePathKind.Relative,
              yamlFrontMatter: parsed.yamlFrontMatter ?? { name: entry.name, description: '' } as SkillYAMLFrontMatter,
              ...(parsed.rawFrontMatter != null && { rawFrontMatter: parsed.rawFrontMatter }),
              markdownAst: parsed.markdownAst,
              markdownContents: parsed.markdownContents,
              dir: {
                pathKind: FilePathKind.Relative,
                path: entry.name,
                basePath: skillDir,
                getDirectoryName: () => entry.name,
                getAbsolutePath: () => path.join(skillDir, entry.name),
              },
            })
          }
        }
      }
    } catch (e) {
      console.error(`Failed to scan skills at ${skillDir}`, e)
    }
  }

  // Collect fast commands
  const fastCommands: FastCommandPrompt[] = []
  if (fs.existsSync(fastCommandDir) && fs.statSync(fastCommandDir).isDirectory()) {
    try {
      const entries = fs.readdirSync(fastCommandDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          const filePath = path.join(fastCommandDir, entry.name)
          const rawContent = fs.readFileSync(filePath, 'utf-8')
          const parsed = parseMarkdown<FastCommandYAMLFrontMatter>(rawContent)
          const content = parsed.contentWithoutFrontMatter
          fastCommands.push({
            type: PromptKind.FastCommand,
            content,
            length: content.length,
            filePathKind: FilePathKind.Relative,
            ...(parsed.yamlFrontMatter != null && { yamlFrontMatter: parsed.yamlFrontMatter }),
            ...(parsed.rawFrontMatter != null && { rawFrontMatter: parsed.rawFrontMatter }),
            markdownAst: parsed.markdownAst,
            markdownContents: parsed.markdownContents,
            dir: {
              pathKind: FilePathKind.Relative,
              path: entry.name,
              basePath: fastCommandDir,
              getDirectoryName: () => entry.name.replace(/\.md$/, ''),
              getAbsolutePath: () => filePath,
            },
          })
        }
      }
    } catch (e) {
      console.error(`Failed to scan fast commands at ${fastCommandDir}`, e)
    }
  }

  // Collect sub agents
  const subAgents: SubAgentPrompt[] = []
  if (fs.existsSync(subAgentDir) && fs.statSync(subAgentDir).isDirectory()) {
    try {
      const entries = fs.readdirSync(subAgentDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          const filePath = path.join(subAgentDir, entry.name)
          const rawContent = fs.readFileSync(filePath, 'utf-8')
          const parsed = parseMarkdown<SubAgentYAMLFrontMatter>(rawContent)
          const content = parsed.contentWithoutFrontMatter
          subAgents.push({
            type: PromptKind.SubAgent,
            content,
            length: content.length,
            filePathKind: FilePathKind.Relative,
            ...(parsed.yamlFrontMatter != null && { yamlFrontMatter: parsed.yamlFrontMatter }),
            ...(parsed.rawFrontMatter != null && { rawFrontMatter: parsed.rawFrontMatter }),
            markdownAst: parsed.markdownAst,
            markdownContents: parsed.markdownContents,
            dir: {
              pathKind: FilePathKind.Relative,
              path: entry.name,
              basePath: subAgentDir,
              getDirectoryName: () => entry.name.replace(/\.md$/, ''),
              getAbsolutePath: () => filePath,
            },
          })
        }
      }
    } catch (e) {
      console.error(`Failed to scan sub agents at ${subAgentDir}`, e)
    }
  }

  const workspace: Workspace = {
    directory: {
      pathKind: FilePathKind.Absolute,
      path: workspaceDir,
      getDirectoryName: () => path.basename(workspaceDir),
    },
    projects: shadowProjects,
  }

  // Build result with only present optional properties
  const result: CollectedInputContext = {
    workspace,
    ideConfigFiles,
    ...(skills.length > 0 && { skills }),
    ...(fastCommands.length > 0 && { fastCommands }),
    ...(subAgents.length > 0 && { subAgents }),
    ...(externalProjects.length > 0 && { externalProjects }),
  }

  // Add globalMemory if file exists
  if (fs.existsSync(globalMemoryFile) && fs.statSync(globalMemoryFile).isFile()) {
    const rawContent = fs.readFileSync(globalMemoryFile, 'utf-8')
    const parsed = parseMarkdown(rawContent)
    const content = parsed.contentWithoutFrontMatter
    return {
      ...result,
      globalMemory: {
        type: PromptKind.GlobalMemory,
        content,
        length: content.length,
        filePathKind: FilePathKind.Relative,
        ...(parsed.yamlFrontMatter != null && { yamlFrontMatter: parsed.yamlFrontMatter }),
        ...(parsed.rawFrontMatter != null && { rawFrontMatter: parsed.rawFrontMatter }),
        markdownAst: parsed.markdownAst,
        markdownContents: parsed.markdownContents,
        dir: {
          pathKind: FilePathKind.Relative,
          path: path.basename(globalMemoryFile),
          basePath: path.dirname(globalMemoryFile),
          getDirectoryName: () => path.basename(globalMemoryFile),
          getAbsolutePath: () => globalMemoryFile,
        },
        parentDirectoryPath: {
          type: GlobalConfigDirectoryType.UserHome,
          directory: {
            pathKind: FilePathKind.Relative,
            path: '',
            basePath: os.homedir(),
            getDirectoryName: () => path.basename(os.homedir()),
            getAbsolutePath: () => os.homedir(),
          },
        },
      },
    }
  }

  return result
}
