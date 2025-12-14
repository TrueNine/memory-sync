import type { CollectedInputContext, PluginOptions, Project, ProjectIDEConfigFile, Workspace } from '@/types'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  DEFAULT_SHADOW_PROJECT_SUFFIX,
  DEFAULT_SHADOW_SOURCE_PROJECT_DIR,
  DEFAULT_WORKSPACE_DIR,
  PathPlaceholders,
} from '@/constants'
import { FilePathKind, IDEKind } from '@/types'

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
          const projectPath = path.join(shadowSourceProjectDir, entry.name)
          shadowProjects.push({
            name: entry.name,
            dirFromWorkspacePath: {
              pathKind: FilePathKind.Relative,
              path: projectPath,
              basePath: workspaceDir,
              getDirectoryName: () => entry.name,
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

  const workspace: Workspace = {
    directory: {
      pathKind: FilePathKind.Absolute,
      path: workspaceDir,
      getDirectoryName: () => path.basename(workspaceDir),
    },
    projects: shadowProjects,
  }

  const result: CollectedInputContext = {
    workspace,
    ideConfigFiles,
  }

  if (externalProjects.length > 0) {
    return {
      ...result,
      externalProjects,
    }
  }

  return result
}
