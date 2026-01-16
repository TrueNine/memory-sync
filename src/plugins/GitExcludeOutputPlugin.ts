import type {
  OutputPluginContext,
  OutputWriteContext,
  WriteResult,
  WriteResults,
} from '@/types'
import type {RelativePath} from '@/types/FileSystemTypes'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {FilePathKind} from '@/types'
import {AbstractOutputPlugin} from './AbstractOutputPlugin'

/** Marker comment for managed section start */
const MANAGED_SECTION_START = '# >>> tnmsc managed start >>>'
/** Marker comment for managed section end */
const MANAGED_SECTION_END = '# <<< tnmsc managed end <<<'

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
          getAbsolutePath: () => path.join(basePath, excludeFilePath),
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
      reason: canWrite ? 'Found git repositories to update' : 'No git repositories found',
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
          project: project.name ?? 'unknown',
        })
        continue
      }

      this.log.info({action: 'write', path: gitInfoExcludePath, message: 'Updating .git/info/exclude', project: project.name ?? 'unknown'})

      const result = await this.writeGitExcludeFile(ctx, gitInfoExcludePath, managedContent, `project:${project.name ?? 'unknown'}`)
      fileResults.push(result)
    }

    const workspaceDir = workspace.directory.path // Also handle workspace root if it has .git and is not already covered by projects
    const workspaceGitInfoDir = path.join(workspaceDir, '.git', 'info')
    const workspaceGitExclude = path.join(workspaceDir, '.git', 'info', 'exclude')

    const projectPaths = new Set(projects.map(p => p.dirFromWorkspacePath?.getAbsolutePath()).filter(Boolean))
    const isWorkspaceAlreadyCovered = projectPaths.has(workspaceDir)

    if (isWorkspaceAlreadyCovered && fs.existsSync(workspaceGitInfoDir)) return {files: fileResults, dirs: []}

    this.log.info({action: 'write', path: workspaceGitExclude, message: 'Updating workspace .git/info/exclude'})
    const result = await this.writeGitExcludeFile(ctx, workspaceGitExclude, managedContent, 'workspace')
    fileResults.push(result)
    return {files: fileResults, dirs: []}
  }

  /**
   * Build the managed content section from globalGitIgnore and shadowGitExclude.
   */
  private buildManagedContent(globalGitIgnore?: string, shadowGitExclude?: string): string {
    const parts: string[] = []

    if (globalGitIgnore != null && globalGitIgnore.trim().length > 0) parts.push(globalGitIgnore.trim())

    if (shadowGitExclude != null && shadowGitExclude.trim().length > 0) parts.push(shadowGitExclude.trim())

    return parts.join('\n')
  }

  /**
   * Merge managed content with existing exclude file content.
   * Preserves user content outside the managed section.
   */
  private mergeWithExisting(existingContent: string, managedContent: string): string {
    const startIdx = existingContent.indexOf(MANAGED_SECTION_START)
    const endIdx = existingContent.indexOf(MANAGED_SECTION_END)

    const managedSection = `${MANAGED_SECTION_START}\n${managedContent}\n${MANAGED_SECTION_END}`

    if (startIdx === -1 || endIdx === -1) {
      const trimmed = existingContent.trimEnd() // No existing managed section, append to end
      return trimmed.length > 0
        ? `${trimmed}\n\n${managedSection}\n`
        : `${managedSection}\n`
    }

    const before = existingContent.slice(0, Math.max(0, startIdx)).trimEnd() // Replace existing managed section
    const after = existingContent.slice(Math.max(0, endIdx + MANAGED_SECTION_END.length)).trimStart()

    const parts: string[] = []
    if (before.length > 0) parts.push(before)
    parts.push(managedSection)
    if (after.length > 0) parts.push(after)

    return `${parts.join('\n\n')}\n`
  }

  private async writeGitExcludeFile(
    ctx: OutputWriteContext,
    filePath: string,
    managedContent: string,
    label: string,
  ): Promise<WriteResult> {
    const workspaceDir = ctx.collectedInputContext.workspace.directory.path // Create RelativePath object for the result
    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: path.relative(workspaceDir, filePath),
      basePath: workspaceDir,
      getDirectoryName: () => path.basename(path.dirname(filePath)),
      getAbsolutePath: () => filePath,
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

      let existingContent = '' // Read existing content and merge
      if (fs.existsSync(filePath)) existingContent = fs.readFileSync(filePath, 'utf8')

      const finalContent = this.mergeWithExisting(existingContent, managedContent)

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
