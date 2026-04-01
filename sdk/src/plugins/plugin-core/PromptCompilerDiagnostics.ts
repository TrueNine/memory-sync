import {CompilerDiagnosticError, formatCompilerDiagnostic} from '@truenine/md-compiler/errors'

export interface PromptCompilerDiagnosticContext {
  readonly promptKind: string
  readonly logicalName: string
  readonly distPath?: string | undefined
  readonly entryDistPath?: string | undefined
  readonly srcPath?: string | undefined
  readonly operation?: string | undefined
}

export interface SourceMappingOptions {
  readonly preferredSourcePath?: string | undefined
  readonly distRootDir?: string | undefined
  readonly srcRootDir?: string | undefined
}

export function resolveSourcePathForDistFile(
  path: typeof import('node:path'),
  distFilePath: string | undefined,
  options: SourceMappingOptions = {}
): string | undefined {
  const {preferredSourcePath, distRootDir, srcRootDir} = options
  if (distFilePath == null || distFilePath.length === 0) return preferredSourcePath
  if (preferredSourcePath != null && preferredSourcePath.length > 0) return preferredSourcePath
  if (distRootDir == null || srcRootDir == null) return void 0

  const relativePath = path.relative(distRootDir, distFilePath)
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) return void 0

  return path.join(srcRootDir, relativePath.replace(/\.mdx$/u, '.src.mdx'))
}

export function getDiagnosticFilePath(error: unknown): string | undefined {
  if (error instanceof CompilerDiagnosticError && error.filePath != null) return error.filePath
  if (!(error instanceof Error) || !('filePath' in error)) return void 0

  const {filePath} = error as Error & {filePath?: unknown}
  if (typeof filePath === 'string' && filePath.length > 0) return filePath
  return void 0
}

export function formatPromptCompilerDiagnostic(
  error: unknown,
  context: PromptCompilerDiagnosticContext
): string {
  const diagnosticFilePath = getDiagnosticFilePath(error)
  const distPath = diagnosticFilePath ?? context.distPath
  const lines = [
    context.operation ?? 'Prompt compilation failed.',
    `prompt kind: ${context.promptKind}`,
    `logical name: ${context.logicalName}`
  ]

  if (context.entryDistPath != null && context.entryDistPath.length > 0 && context.entryDistPath !== distPath) {
    lines.push(`entry dist file: ${context.entryDistPath}`)
  }

  if (distPath != null && distPath.length > 0) lines.push(`dist file: ${distPath}`)
  lines.push(`src file: ${context.srcPath ?? '<unresolved>'}`)
  lines.push('diagnostic:')
  lines.push(error instanceof Error ? formatCompilerDiagnostic(error) : String(error))

  return lines.join('\n')
}
