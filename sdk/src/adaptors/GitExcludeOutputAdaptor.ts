import type {
  OutputCleanContext,
  OutputCleanupDeclarations,
  OutputFileDeclaration,
  OutputWriteContext
} from './adaptor-core'
import * as path from 'node:path'
import {AbstractOutputAdaptor, findAllGitRepos, resolveGitInfoDir} from './adaptor-core'

export class GitExcludeOutputAdaptor extends AbstractOutputAdaptor {
  constructor() {
    super('GitExcludeOutputAdaptor', {capabilities: {}})
  }

  override async declareOutputFiles(ctx: OutputWriteContext): Promise<OutputFileDeclaration[]> {
    const declarations: OutputFileDeclaration[] = []
    const {globalGitIgnore, shadowGitExclude} = ctx.collectedOutputContext
    const managedContent = this.buildManagedContent(globalGitIgnore, shadowGitExclude)
    if (managedContent.length === 0) return declarations

    const finalContent = this.normalizeContent(managedContent)
    for (const excludePath of this.collectManagedExcludePaths(ctx)) {
      declarations.push({
        path: excludePath,
        scope: 'project',
        source: {content: finalContent}
      })
    }

    return declarations
  }

  override async declareCleanupPaths(
    ctx: OutputCleanContext
  ): Promise<OutputCleanupDeclarations> {
    const deletePaths = this.collectManagedExcludePaths(ctx).map(excludePath => ({
      path: excludePath,
      kind: 'file' as const,
      scope: 'project' as const,
      label: 'delete.project'
    }))

    if (deletePaths.length === 0) return {}
    return {delete: deletePaths}
  }

  override async convertContent(
    declaration: OutputFileDeclaration,
    ctx: OutputWriteContext
  ): Promise<string> {
    void ctx
    const source = declaration.source as {content?: string}
    if (source.content == null) throw new Error(`Unsupported declaration source for ${this.name}`)
    return source.content
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

  private collectManagedExcludePaths(
    ctx: Pick<OutputWriteContext, 'collectedOutputContext'>
  ): string[] {
    const {workspace} = ctx.collectedOutputContext
    const repoRoots = new Set<string>([path.resolve(workspace.directory.path)])
    const excludePaths = new Set<string>()

    for (const project of workspace.projects) {
      if (project.dirFromWorkspacePath == null) continue
      repoRoots.add(project.dirFromWorkspacePath.getAbsolutePath())
    }

    for (const repoRoot of repoRoots) {
      for (const repoDir of [repoRoot, ...findAllGitRepos(repoRoot)]) {
        const gitInfoDir = resolveGitInfoDir(repoDir)
        if (gitInfoDir == null) continue
        excludePaths.add(path.join(gitInfoDir, 'exclude'))
      }
    }

    return [...excludePaths]
  }
}
