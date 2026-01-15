import type {OutputWriteContext} from '@/types'
import * as path from 'node:path'
import {AbstractOutputPlugin} from './AbstractOutputPlugin'

export class GitExcludeOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('GitExcludeOutputPlugin')
  }

  async write(ctx: OutputWriteContext): Promise<void> {
    const {globalGitIgnore} = ctx.collectedInputContext
    if (globalGitIgnore == null || globalGitIgnore.length === 0) {
      this.log.debug({action: 'write', message: 'No global gitignore content found, skipping'})
      return
    }

    const {workspace} = ctx.collectedInputContext // We want to write to .git/info/exclude for each project that has a .git directory or is a git repo. // Usually .git is at the root of the workspace or project.

    const {projects} = workspace

    for (const project of projects) {
      if (!project.dirFromWorkspacePath) continue // Determine the project root.

      const projectDir = project.dirFromWorkspacePath.getAbsolutePath()
      const gitInfoExcludePath = path.join(projectDir, '.git', 'info', 'exclude')

      if (!this.existsSync(path.dirname(gitInfoExcludePath))) { // Check if .git/info/exclude exists or if .git/info exists.
        this.log.debug({action: 'write', path: gitInfoExcludePath, message: 'Target .git/info/exclude directory does not exist, skipping'})
        continue
      }

      this.log.info({action: 'write', path: gitInfoExcludePath, message: 'Updating .git/info/exclude'})

      await this.writeFile(ctx, gitInfoExcludePath, globalGitIgnore, 'GitExclude') // Overwrite the file with the global rules.
    }

    const workspaceDir = workspace.directory.path // Also check the workspace root itself if it's not covered by projects
    const workspaceGitExclude = path.join(workspaceDir, '.git', 'info', 'exclude')

    const projectPaths = new Set(projects.map(p => p.dirFromWorkspacePath?.getAbsolutePath())) // Avoid double writing if workspaceDir is same as one of the projects
    if (!projectPaths.has(workspaceDir) && this.existsSync(path.dirname(workspaceGitExclude))) {
      this.log.info({action: 'write', path: workspaceGitExclude, message: 'Updating workspace .git/info/exclude'})
      await this.writeFile(ctx, workspaceGitExclude, globalGitIgnore, 'GitExcludeWorkspace')
    }
  }

  async clean(_ctx: OutputWriteContext): Promise<void> {
  } // No explicit cleanup defined for now
}
