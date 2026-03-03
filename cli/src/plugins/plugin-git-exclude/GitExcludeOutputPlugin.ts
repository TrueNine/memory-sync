import type {
  OutputPluginContext,
  OutputWriteContext,
  WriteResult,
  WriteResults
} from '../plugin-shared'
import type {RelativePath} from '../plugin-shared/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {AbstractOutputPlugin, findAllGitRepos, findGitModuleInfoDirs, resolveGitInfoDir} from '@truenine/plugin-output-shared'
import {FilePathKind} from '../plugin-shared'

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
      if (project.isPromptSourceProject === true) continue // Skip prompt source projects

      const projectDirPath = project.dirFromWorkspacePath
      const projectDir = projectDirPath.getAbsolutePath()
      const {basePath} = projectDirPath
      const gitRepoDirs = [projectDir, ...findAllGitRepos(projectDir)] // project root + nested submodules/repos

      for (const repoDir of gitRepoDirs) {
        const gitInfoDir = resolveGitInfoDir(repoDir)
        if (gitInfoDir == null) continue

        const excludeFilePath = path.join(gitInfoDir, 'exclude')
        const relExcludePath = path.relative(basePath, excludeFilePath)

        results.push({
          pathKind: FilePathKind.Relative,
          path: relExcludePath,
          basePath,
          getDirectoryName: () => path.basename(repoDir),
          getAbsolutePath: () => excludeFilePath
        })
      }
    }

    const wsDir = ctx.collectedInputContext.workspace.directory.path // Also register .git/modules/ exclude files
    const wsDotGit = path.join(wsDir, '.git')
    if (fs.existsSync(wsDotGit) && fs.lstatSync(wsDotGit).isDirectory()) {
      for (const moduleInfoDir of findGitModuleInfoDirs(wsDotGit)) {
        const excludeFilePath = path.join(moduleInfoDir, 'exclude')
        const relExcludePath = path.relative(wsDir, excludeFilePath)

        results.push({
          pathKind: FilePathKind.Relative,
          path: relExcludePath,
          basePath: wsDir,
          getDirectoryName: () => path.basename(path.dirname(moduleInfoDir)),
          getAbsolutePath: () => excludeFilePath
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

    const {projects} = ctx.collectedInputContext.workspace
    const hasGitProjects = projects.some(project => {
      if (project.dirFromWorkspacePath == null) return false
      const projectDir = project.dirFromWorkspacePath.getAbsolutePath()
      if (resolveGitInfoDir(projectDir) != null) return true // Check project root
      return findAllGitRepos(projectDir).some(d => resolveGitInfoDir(d) != null) // Check nested repos
    })

    const workspaceDir = ctx.collectedInputContext.workspace.directory.path
    const hasWorkspaceGit = resolveGitInfoDir(workspaceDir) != null

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
    const writtenPaths = new Set<string>() // Track written paths to avoid duplicates

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) continue

      const projectDir = project.dirFromWorkspacePath.getAbsolutePath()
      const gitRepoDirs = [projectDir, ...findAllGitRepos(projectDir)] // project root + nested submodules/repos

      for (const repoDir of gitRepoDirs) {
        const gitInfoDir = resolveGitInfoDir(repoDir)
        if (gitInfoDir == null) continue

        const gitInfoExcludePath = path.join(gitInfoDir, 'exclude')

        if (writtenPaths.has(gitInfoExcludePath)) continue
        writtenPaths.add(gitInfoExcludePath)

        const label = repoDir === projectDir
          ? `project:${project.name ?? 'unknown'}`
          : `nested:${path.relative(projectDir, repoDir)}`

        this.log.trace({action: 'write', path: gitInfoExcludePath, label})

        const result = await this.writeGitExcludeFile(ctx, gitInfoExcludePath, managedContent, label)
        fileResults.push(result)
      }
    }

    const workspaceDir = workspace.directory.path
    const workspaceGitInfoDir = resolveGitInfoDir(workspaceDir) // workspace root .git (may also be submodule host)

    if (workspaceGitInfoDir != null) {
      const workspaceGitExclude = path.join(workspaceGitInfoDir, 'exclude')

      if (!writtenPaths.has(workspaceGitExclude)) {
        this.log.trace({action: 'write', path: workspaceGitExclude, target: 'workspace'})
        const result = await this.writeGitExcludeFile(ctx, workspaceGitExclude, managedContent, 'workspace')
        fileResults.push(result)
        writtenPaths.add(workspaceGitExclude)
      }
    }

    const workspaceNestedRepos = findAllGitRepos(workspaceDir) // nested repos under workspace root not covered by projects
    for (const repoDir of workspaceNestedRepos) {
      const gitInfoDir = resolveGitInfoDir(repoDir)
      if (gitInfoDir == null) continue

      const excludePath = path.join(gitInfoDir, 'exclude')
      if (writtenPaths.has(excludePath)) continue
      writtenPaths.add(excludePath)

      const label = `workspace-nested:${path.relative(workspaceDir, repoDir)}`
      this.log.trace({action: 'write', path: excludePath, label})

      const result = await this.writeGitExcludeFile(ctx, excludePath, managedContent, label)
      fileResults.push(result)
    }

    const dotGitDir = path.join(workspaceDir, '.git') // Scan .git/modules/ for submodule info dirs
    if (fs.existsSync(dotGitDir) && fs.lstatSync(dotGitDir).isDirectory()) {
      for (const moduleInfoDir of findGitModuleInfoDirs(dotGitDir)) {
        const excludePath = path.join(moduleInfoDir, 'exclude')
        if (writtenPaths.has(excludePath)) continue
        writtenPaths.add(excludePath)

        const label = `git-module:${path.relative(dotGitDir, moduleInfoDir)}`
        this.log.trace({action: 'write', path: excludePath, label})

        const result = await this.writeGitExcludeFile(ctx, excludePath, managedContent, label)
        fileResults.push(result)
      }
    }

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
    const workspaceDir = ctx.collectedInputContext.workspace.directory.path // Create RelativePath for the result
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
