import type { PluginOptions } from '@/types'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  DEFAULT_SHADOW_PROJECT_SUFFIX,
  DEFAULT_WORKSPACE_DIR,
  PathPlaceholders,
} from '@/constants'

const PLACEHOLDER_USER_HOME = PathPlaceholders.USER_HOME
const PLACEHOLDER_SHADOW_PROJECT = PathPlaceholders.SHADOW_PROJECT
const PLACEHOLDER_WORKSPACE = PathPlaceholders.WORKSPACE

export function resolvePath(
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

export function resolveBasePaths(options: PluginOptions): { workspaceDir: string, shadowProjectDir: string } {
  const workspaceDirRaw = options.workspaceDir ?? DEFAULT_WORKSPACE_DIR
  const workspaceDir = resolvePath(workspaceDirRaw, '', '')

  const shadowProjectDirRaw = options.shadowProjectDir ?? `${PLACEHOLDER_WORKSPACE}/${DEFAULT_SHADOW_PROJECT_SUFFIX}`
  const shadowProjectDir = resolvePath(shadowProjectDirRaw, workspaceDir, '')

  return { workspaceDir, shadowProjectDir }
}
