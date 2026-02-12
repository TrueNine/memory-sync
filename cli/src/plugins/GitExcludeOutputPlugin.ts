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

/**
 * Resolves the actual `.git/info` directory for a given project path.
 * Handles both regular git repos (`.git` is a directory) and submodules/worktrees (`.git` is a file with `gitdir:` pointer).
 * Returns `null` if no valid git info directory can be resolved.
 */
function resolveGitInfoDir(projectDir: string): string | null {
  const dotGitPath = path.join(projectDir, '.git')

  if (!fs.existsSync(dotGitPath)) return null

  const stat = fs.lstatSync(dotGitPath)

  if (stat.isDirectory()) {
    const infoDir = path.join(dotGitPath, 'info')
    return infoDir // Return even if not yet created — writeGitExcludeFile will mkdir
  }

  if (stat.isFile()) { // Submodule or worktree: `.git` is a file containing `gitdir: <path>`
    try {
      const content = fs.readFileSync(dotGitPath, 'utf8').trim()
      const match = /^gitdir: (.+)$/.exec(content)
      if (match?.[1] != null) {
        const gitdir = path.resolve(projectDir, match[1])
        return path.join(gitdir, 'info')
      }
    }
    catch { /* ignore read errors */ }
  }

  return null
}

/**
 * Recursively discovers all `.git` entries (directories or files) under a given root,
 * skipping common non-source directories.
 * Returns absolute paths of directories containing a `.git` entry.
 */
function findAllGitRepos(rootDir: string, maxDepth = 5): string[] {
  const results: string[] = []
  const SKIP_DIRS = new Set(['node_modules', '.turbo', 'dist', 'build', 'out', '.cache'])

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return

    let entries: fs.Dirent[]
    try {
      const raw = fs.readdirSync(dir, {withFileTypes: true})
      if (!Array.isArray(raw)) return
      entries = raw
    }
    catch { return }

    const hasGit = entries.some(e => e.name === '.git')
    if (hasGit && dir !== rootDir) results.push(dir) // Don't add rootDir itself — it's handled separately

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name === '.git' || SKIP_DIRS.has(entry.name)) continue
      walk(path.join(dir, entry.name), depth + 1)
    }
  }

  walk(rootDir, 0)
  return results
}

/**
 * Scans `.git/modules/` directory recursively to find all submodule `info/` dirs.
 * Handles nested submodules (modules within modules).
 * Returns absolute paths of `info/` directories.
 */
function findGitModuleInfoDirs(dotGitDir: string): string[] {
  const modulesDir = path.join(dotGitDir, 'modules')
  if (!fs.existsSync(modulesDir)) return []

  const results: string[] = []

  function walk(dir: string): void {
    let entries: fs.Dirent[]
    try {
      const raw = fs.readdirSync(dir, {withFileTypes: true})
      if (!Array.isArray(raw)) return
      entries = raw
    }
    catch { return }

    const hasInfo = entries.some(e => e.name === 'info' && e.isDirectory())
    if (hasInfo) results.push(path.join(dir, 'info'))

    const nestedModules = entries.find(e => e.name === 'modules' && e.isDirectory()) // Recurse into nested modules/
    if (nestedModules != null) {
      let subEntries: fs.Dirent[]
      try {
        const raw = fs.readdirSync(path.join(dir, 'modules'), {withFileTypes: true})
        if (!Array.isArray(raw)) return
        subEntries = raw
      }
      catch { return }
      for (const sub of subEntries) {
        if (sub.isDirectory()) walk(path.join(dir, 'modules', sub.name))
      }
    }
  }

  let topEntries: fs.Dirent[]
  try {
    const raw = fs.readdirSync(modulesDir, {withFileTypes: true})
    if (!Array.isArray(raw)) return results
    topEntries = raw
  }
  catch { return results }

  for (const entry of topEntries) {
    if (entry.isDirectory()) walk(path.join(modulesDir, entry.name))
  }

  return results
}

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

        this.log.info({action: 'write', path: gitInfoExcludePath, label})

        const result = await this.writeGitExcludeFile(ctx, gitInfoExcludePath, managedContent, label)
        fileResults.push(result)
      }
    }

    const workspaceDir = workspace.directory.path
    const workspaceGitInfoDir = resolveGitInfoDir(workspaceDir) // workspace root .git (may also be submodule host)

    if (workspaceGitInfoDir != null) {
      const workspaceGitExclude = path.join(workspaceGitInfoDir, 'exclude')

      if (!writtenPaths.has(workspaceGitExclude)) {
        this.log.info({action: 'write', path: workspaceGitExclude, target: 'workspace'})
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
      this.log.info({action: 'write', path: excludePath, label})

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
        this.log.info({action: 'write', path: excludePath, label})

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
