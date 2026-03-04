import type {
  OutputCleanContext,
  OutputCleanupDeclarations,
  OutputFileDeclaration,
  OutputWriteContext
} from './plugin-core'
import * as path from 'node:path'
import {AbstractOutputPlugin, findAllGitRepos, findGitModuleInfoDirs, resolveGitInfoDir} from './plugin-core'

export class GitExcludeOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('GitExcludeOutputPlugin', {capabilities: {}})
  }

  override async declareCleanupPaths(ctx: OutputCleanContext): Promise<OutputCleanupDeclarations> {
    const declarations = await this.declareOutputFiles({...ctx, dryRun: true})
    return {
      protect: declarations.map(declaration => ({
        path: declaration.path,
        kind: 'file' as const,
        ...declaration.scope != null && {scope: declaration.scope}
      }))
    }
  }

  override async declareOutputFiles(ctx: OutputWriteContext): Promise<OutputFileDeclaration[]> {
    const declarations: OutputFileDeclaration[] = []
    const {workspace, globalGitIgnore, shadowGitExclude} = ctx.collectedOutputContext
    const managedContent = this.buildManagedContent(globalGitIgnore, shadowGitExclude)
    if (managedContent.length === 0) return declarations

    const finalContent = this.normalizeContent(managedContent)
    const writtenPaths = new Set<string>()
    const {projects} = workspace

    for (const project of projects) {
      if (project.dirFromWorkspacePath == null) continue

      const projectDir = project.dirFromWorkspacePath.getAbsolutePath()
      const gitRepoDirs = [projectDir, ...findAllGitRepos(projectDir)]

      for (const repoDir of gitRepoDirs) {
        const gitInfoDir = resolveGitInfoDir(repoDir)
        if (gitInfoDir == null) continue

        const excludePath = path.join(gitInfoDir, 'exclude')
        if (writtenPaths.has(excludePath)) continue
        writtenPaths.add(excludePath)

        declarations.push({
          path: excludePath,
          scope: 'project',
          source: {content: finalContent}
        })
      }
    }

    const workspaceDir = workspace.directory.path
    const workspaceGitInfoDir = resolveGitInfoDir(workspaceDir)
    if (workspaceGitInfoDir != null) {
      const workspaceExcludePath = path.join(workspaceGitInfoDir, 'exclude')
      if (!writtenPaths.has(workspaceExcludePath)) {
        writtenPaths.add(workspaceExcludePath)
        declarations.push({
          path: workspaceExcludePath,
          scope: 'workspace',
          source: {content: finalContent}
        })
      }
    }

    const workspaceNestedRepos = findAllGitRepos(workspaceDir)
    for (const repoDir of workspaceNestedRepos) {
      const gitInfoDir = resolveGitInfoDir(repoDir)
      if (gitInfoDir == null) continue

      const excludePath = path.join(gitInfoDir, 'exclude')
      if (writtenPaths.has(excludePath)) continue
      writtenPaths.add(excludePath)
      declarations.push({
        path: excludePath,
        scope: 'workspace',
        source: {content: finalContent}
      })
    }

    const dotGitDir = path.join(workspaceDir, '.git')
    if (this.existsSync(dotGitDir) && this.lstatSync(dotGitDir).isDirectory()) {
      for (const moduleInfoDir of findGitModuleInfoDirs(dotGitDir)) {
        const excludePath = path.join(moduleInfoDir, 'exclude')
        if (writtenPaths.has(excludePath)) continue
        writtenPaths.add(excludePath)
        declarations.push({
          path: excludePath,
          scope: 'workspace',
          source: {content: finalContent}
        })
      }
    }

    return declarations
  }

  override async convertContent(
    declaration: OutputFileDeclaration,
    _ctx: OutputWriteContext
  ): Promise<string> {
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
}
