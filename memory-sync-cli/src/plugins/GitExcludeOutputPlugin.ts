import type {
  OutputPluginContext,
  OutputWriteContext,
  WriteResult,
  WriteResults
} from '@/types'
import type {RelativePath} from '@/types/FileSystemTypes'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {FilePathKind} from '@/types'
import {AbstractOutputPlugin} from './AbstractOutputPlugin'

export class GitExcludeOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('GitExcludeOutputPlugin')
  }

  async registerProjectOutputDirs(): Promise<RelativePath[]> {
    return [] // No directories to clean
  }

  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {projects} = ctx.collectedInputContext.workspace

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) continue

      if (project.isPromptSourceProject === true) continue // Skip prompt source projects - their files should be protected from cleanup

      const projectDirPath = project.dirFromWorkspacePath
      const projectDir = projectDirPath.getAbsolutePath()
      const gitInfoDir = path.join(projectDir, '.git', 'info')

      if (fs.existsSync(gitInfoDir)) { // Only register if .git/info directory exists (indicating a git repository)
        const excludeFilePath = path.join(projectDirPath.path, '.git', 'info', 'exclude')
        const dirPath = projectDirPath.path
        const {basePath} = projectDirPath
        results.push({
          pathKind: FilePathKind.Relative,
          path: excludeFilePath,
          basePath,
          getDirectoryName: () => path.basename(dirPath),
          getAbsolutePath: () => path.join(basePath, excludeFilePath)
        })
      }
    }

    return results
  }

  async registerGlobalOutputDirs(): Promise<RelativePath[]> {
    return [] // No global directories to clean
  }

  async registerGlobalOutputFiles(): Promise<RelativePath[]> {
    return [] // No global files to clean - workspace exclude is handled in writeProjectOutputs
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {globalGitIgnore, shadowGitExclude} = ctx.collectedInputContext
    const hasContent = (globalGitIgnore != null && globalGitIgnore.length > 0)
      || (shadowGitExclude != null && shadowGitExclude.length > 0)

    if (!hasContent) {
      this.log.debug({action: 'canWrite', result: false, reason: 'No gitignore or exclude content found'})
      return false
    }

    const {projects} = ctx.collectedInputContext.workspace // Check if any projects have .git directories
    const hasGitProjects = projects.some(project => {
      if (project.dirFromWorkspacePath == null) return false
      const gitInfoDir = path.join(project.dirFromWorkspacePath.getAbsolutePath(), '.git', 'info')
      return fs.existsSync(gitInfoDir)
    })

    const workspaceGitInfoDir = path.join(ctx.collectedInputContext.workspace.directory.path, '.git', 'info') // Also check workspace root
    const hasWorkspaceGit = fs.existsSync(workspaceGitInfoDir)

    const canWrite = hasGitProjects || hasWorkspaceGit
    this.log.debug({
      action: 'canWrite',
      result: canWrite,
      hasGitProjects,
      hasWorkspaceGit,
      reason: canWrite ? 'Found git repositories to update' : 'No git repositories found'
    })

    return canWrite
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const fileResults: WriteResult[] = []
    const {globalGitIgnore, shadowGitExclude} = ctx.collectedInputContext

    const managedContent = this.buildManagedContent(globalGitIgnore, shadowGitExclude)

    if (managedContent.length === 0) {
      this.log.debug({action: 'write', message: 'No gitignore or exclude content found, skipping'})
      return {files: [], dirs: []}
    }

    const {workspace} = ctx.collectedInputContext
    const {projects} = workspace

    for (const project of projects) { // Process each project that has a .git directory
      if (project.dirFromWorkspacePath == null) continue

      const projectDir = project.dirFromWorkspacePath.getAbsolutePath()
      const gitInfoDir = path.join(projectDir, '.git', 'info')
      const gitInfoExcludePath = path.join(projectDir, '.git', 'info', 'exclude')

      if (!fs.existsSync(gitInfoDir)) { // Check if .git/info directory exists
        this.log.debug({
          action: 'write',
          path: gitInfoExcludePath,
          message: 'Git info directory does not exist, skipping',
          project: project.name ?? 'unknown'
        })
        continue
      }

      this.log.info({action: 'write', path: gitInfoExcludePath, project: project.name ?? 'unknown'})

      const result = await this.writeGitExcludeFile(ctx, gitInfoExcludePath, managedContent, `project:${project.name ?? 'unknown'}`)
      fileResults.push(result)
    }

    const workspaceDir = workspace.directory.path // Also handle workspace root if it has .git and is not already covered by projects
    const workspaceGitInfoDir = path.join(workspaceDir, '.git', 'info')
    const workspaceGitExclude = path.join(workspaceDir, '.git', 'info', 'exclude')

    const projectPaths = new Set(projects.map(p => p.dirFromWorkspacePath?.getAbsolutePath()).filter(Boolean))
    const isWorkspaceAlreadyCovered = projectPaths.has(workspaceDir)

    if (isWorkspaceAlreadyCovered && fs.existsSync(workspaceGitInfoDir)) return {files: fileResults, dirs: []}

    this.log.info({action: 'write', path: workspaceGitExclude, target: 'workspace'})
    const result = await this.writeGitExcludeFile(ctx, workspaceGitExclude, managedContent, 'workspace')
    fileResults.push(result)
    return {files: fileResults, dirs: []}
  }

  private buildManagedContent(globalGitIgnore?: string, shadowGitExclude?: string): string {
    const parts: string[] = []

    if (globalGitIgnore != null && globalGitIgnore.trim().length > 0) { // Handle globalGitIgnore first
      const sanitized = this.sanitizeContent(globalGitIgnore)
      if (sanitized.length > 0) parts.push(sanitized)
    }

    if (shadowGitExclude != null && shadowGitExclude.trim().length > 0) { // Handle shadowGitExclude
      const sanitized = this.sanitizeContent(shadowGitExclude)
      if (sanitized.length > 0) parts.push(sanitized)
    }

    if (parts.length === 0) return '' // Return early if no content was added
    return parts.join('\n')
  }

  private sanitizeContent(content: string): string {
    const lines = content.split(/\r?\n/)
    const filtered = lines.filter(line => {
      const trimmed = line.trim()
      if (trimmed.length === 0) return true
      return !(trimmed.startsWith('#') && !trimmed.startsWith('\\#'))
    })
    return filtered.join('\n').trim()
  }

  private normalizeContent(content: string): string {
    const trimmed = content.trim()
    if (trimmed.length === 0) return ''
    return `${trimmed}\n`
  }

  private async writeGitExcludeFile(
    ctx: OutputWriteContext,
    filePath: string,
    managedContent: string,
    label: string
  ): Promise<WriteResult> {
    const workspaceDir = ctx.collectedInputContext.workspace.directory.path // Create RelativePath object for the result
    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.relative(workspaceDir, filePath),
      basePath: workspaceDir,
      getDirectoryName: () => path.basename(path.dirname(filePath)),
      getAbsolutePath: () => filePath
    }

    if (ctx.dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'gitExclude', path: filePath, label})
      return {path: relativePath, success: true, skipped: false}
    }

    try {
      const gitInfoDir = path.dirname(filePath) // Ensure the .git/info directory exists
      if (!fs.existsSync(gitInfoDir)) {
        fs.mkdirSync(gitInfoDir, {recursive: true})
        this.log.debug({action: 'mkdir', path: gitInfoDir, message: 'Created .git/info directory'})
      }

      const finalContent = this.normalizeContent(managedContent)

      fs.writeFileSync(filePath, finalContent, 'utf8') // Write the exclude file
      this.log.trace({action: 'write', type: 'gitExclude', path: filePath, label})
      return {path: relativePath, success: true}
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'gitExclude', path: filePath, label, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
  }
}
