import type { CollectedInputContext, PluginOptions, Workspace } from '@/types'
import * as path from 'node:path'
import { FilePathKind } from '@/types'
import { resolveAllPaths, resolveExternalProjects } from '@/utils/paths'

export function defineConfig(options: PluginOptions = {}): CollectedInputContext {
  const resolvedPaths = resolveAllPaths(options)
  const { workspaceDir, shadowProjectDir } = resolvedPaths

  const workspace: Workspace = {
    directory: {
      pathKind: FilePathKind.Absolute,
      path: workspaceDir,
      getDirectoryName: () => path.basename(workspaceDir),
    },
    projects: [],
  }

  const externalProjects = resolveExternalProjects(
    options.externalProjects,
    workspaceDir,
    shadowProjectDir,
  )

  const result: CollectedInputContext = {
    workspace,
    ideConfigFiles: [],
  }

  if (externalProjects.length > 0) {
    return {
      ...result,
      externalProjects,
    }
  }

  return result
}
