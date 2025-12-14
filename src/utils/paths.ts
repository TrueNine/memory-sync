import type { PluginOptions, Project } from '@/types'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  DEFAULT_SHADOW_FAST_COMMAND_DIR,
  DEFAULT_SHADOW_PROJECT_SUFFIX,
  DEFAULT_SHADOW_SKILL_SOURCE_DIR,
  DEFAULT_SHADOW_SOURCE_PROJECT_DIR,
  DEFAULT_WORKSPACE_DIR,
  PathPlaceholders,
} from '@/constants'
import { FilePathKind } from '@/types'

const PLACEHOLDER_USER_HOME: string = PathPlaceholders.USER_HOME
const PLACEHOLDER_SHADOW_PROJECT: string = PathPlaceholders.SHADOW_PROJECT
const PLACEHOLDER_WORKSPACE: string = PathPlaceholders.WORKSPACE

export function resolvePlaceholderPath(
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

export function resolveWorkspaceDir(workspaceDirOption: string | undefined): string {
  const raw = workspaceDirOption ?? DEFAULT_WORKSPACE_DIR
  return resolvePlaceholderPath(raw, '', '')
}

export function resolveShadowProjectDir(shadowProjectDir: string | undefined, workspaceDir: string): string {
  const raw = shadowProjectDir ?? `${PLACEHOLDER_WORKSPACE}/${DEFAULT_SHADOW_PROJECT_SUFFIX}`
  return resolvePlaceholderPath(raw, workspaceDir, '')
}

export function resolveShadowSkillSourceDir(
  shadowSkillSourceDir: string | undefined,
  workspaceDir: string,
  shadowProjectDir: string,
): string {
  const raw = shadowSkillSourceDir ?? DEFAULT_SHADOW_SKILL_SOURCE_DIR
  return resolvePlaceholderPath(raw, workspaceDir, shadowProjectDir)
}

export function resolveShadowFastCommandDir(
  shadowFastCommandDir: string | undefined,
  workspaceDir: string,
  shadowProjectDir: string,
): string {
  const raw = shadowFastCommandDir ?? DEFAULT_SHADOW_FAST_COMMAND_DIR
  return resolvePlaceholderPath(raw, workspaceDir, shadowProjectDir)
}

export function resolveShadowSourceProjectDir(
  shadowSourceProjectDir: string | undefined,
  workspaceDir: string,
  shadowProjectDir: string,
): string {
  const raw = shadowSourceProjectDir ?? DEFAULT_SHADOW_SOURCE_PROJECT_DIR
  return resolvePlaceholderPath(raw, workspaceDir, shadowProjectDir)
}

export function resolveExternalProjects(
  externalProjects: readonly string[] | undefined,
  workspaceDir: string,
  shadowProjectDir: string,
): Project[] {
  if (!externalProjects || externalProjects.length === 0) {
    return []
  }

  return externalProjects.map((projectPath) => {
    const resolvedPath = resolvePlaceholderPath(projectPath, workspaceDir, shadowProjectDir)
    return {
      name: path.basename(resolvedPath),
      dirFromWorkspacePath: {
        pathKind: FilePathKind.Relative,
        path: resolvedPath,
        basePath: workspaceDir,
        getDirectoryName: () => path.basename(resolvedPath),
      },
    }
  })
}

export interface ResolvedPaths {
  workspaceDir: string
  shadowProjectDir: string
  shadowSkillSourceDir: string
  shadowFastCommandDir: string
  shadowSourceProjectDir: string
}

export function resolveAllPaths(options: PluginOptions = {}): ResolvedPaths {
  const workspaceDir = resolveWorkspaceDir(options.workspaceDir)
  const shadowProjectDir = resolveShadowProjectDir(options.shadowProjectDir, workspaceDir)
  const shadowSkillSourceDir = resolveShadowSkillSourceDir(
    options.shadowSkillSourceDir,
    workspaceDir,
    shadowProjectDir,
  )
  const shadowFastCommandDir = resolveShadowFastCommandDir(
    options.shadowFastCommandDir,
    workspaceDir,
    shadowProjectDir,
  )
  const shadowSourceProjectDir = resolveShadowSourceProjectDir(
    options.shadowSourceProjectDir,
    workspaceDir,
    shadowProjectDir,
  )

  return {
    workspaceDir,
    shadowProjectDir,
    shadowSkillSourceDir,
    shadowFastCommandDir,
    shadowSourceProjectDir,
  }
}
