import type {
  DiagnosticLines,
  LoggerDiagnosticInput,
  LoggerDiagnosticRecord
} from './plugins/plugin-core'
import type {ProtectedPathViolation} from './ProtectedDeletionGuard'
import process from 'node:process'
import {resolveBlockingFilePath} from './path-blocking-file'

export function diagnosticLines(firstLine: string, ...otherLines: string[]): DiagnosticLines {
  return [firstLine, ...otherLines]
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function splitDiagnosticText(text: string): DiagnosticLines {
  const lines = text
    .split(/\r?\n/u)
    .map(line => line.trimEnd())
    .filter(line => line.length > 0)

  if (lines.length === 0) return diagnosticLines('No diagnostic details were provided.')
  const [firstLine, ...otherLines] = lines
  if (firstLine == null) return diagnosticLines('No diagnostic details were provided.')
  return diagnosticLines(firstLine, ...otherLines)
}

export function buildDiagnostic(input: LoggerDiagnosticInput): LoggerDiagnosticInput {
  return input
}

interface DiagnosticFailure {
  readonly path: string
  readonly error: unknown
  readonly details?: Record<string, unknown> | undefined
}

interface FileOperationDiagnosticOptions {
  readonly code: string
  readonly title: string
  readonly operation: string
  readonly targetKind: string
  readonly path: string
  readonly error: unknown
  readonly platform?: NodeJS.Platform | undefined
  readonly exactFix?: DiagnosticLines | undefined
  readonly possibleFixes?: readonly DiagnosticLines[] | undefined
  readonly details?: Record<string, unknown> | undefined
}

interface FileOperationAdvice {
  readonly exactFix: DiagnosticLines
  readonly possibleFixes: readonly DiagnosticLines[]
}

function normalizeErrorMessage(error: unknown): string {
  return toErrorMessage(error).toLowerCase()
}

function isWindowsDirectoryDeletePermissionDenied(options: {
  readonly operation: string
  readonly targetKind: string
  readonly error: unknown
  readonly platform: NodeJS.Platform
}): boolean {
  if (options.platform !== 'win32') return false
  if (options.operation !== 'delete') return false
  if (options.targetKind !== 'directory') return false

  const normalizedError = normalizeErrorMessage(options.error)
  return normalizedError.includes('eperm') || normalizedError.includes('permission denied')
}

function buildFileOperationAdvice(options: {
  readonly operation: string
  readonly targetKind: string
  readonly path: string
  readonly error: unknown
  readonly platform: NodeJS.Platform
  readonly blockingPath?: string | undefined
}): FileOperationAdvice {
  if (options.blockingPath != null) {
    return {
      exactFix: diagnosticLines(
        `Delete the blocking file at "${options.blockingPath}" and rerun tnmsc.`,
        'tnmsc expects a directory there, so you do not need to keep that file.'
      ),
      possibleFixes: [
        diagnosticLines(
          `A file is occupying a directory path required for "${options.path}".`
        ),
        diagnosticLines(
          'If that file came from an older tool or a mistaken manual edit, remove it and let tnmsc recreate the directory tree.'
        )
      ]
    }
  }

  if (isWindowsDirectoryDeletePermissionDenied(options)) {
    return {
      exactFix: diagnosticLines(
        `Close any process that is using "${options.path}", delete the stale directory, and rerun tnmsc.`,
        `Common lockers on Windows include editors, terminals, antivirus scanners, sync clients, and AI tools watching generated files.`
      ),
      possibleFixes: [
        diagnosticLines(
          `Use Resource Monitor or Process Explorer to find which process holds a handle under "${options.path}".`
        ),
        diagnosticLines(
          `Make sure no shell, editor tab, or file watcher is currently opened inside "${options.path}" or one of its children.`
        ),
        diagnosticLines(
          `If antivirus or cloud sync is scanning generated outputs, wait for it to release the directory or exclude this output path.`
        )
      ]
    }
  }

  return {
    exactFix: diagnosticLines(
      `Verify that "${options.path}" exists, has the expected type, and is accessible to tnmsc.`
    ),
    possibleFixes: [
      diagnosticLines('Check file permissions and ownership for the target path.'),
      diagnosticLines('Confirm that another process did not delete, move, or lock the target path.')
    ]
  }
}

export function buildFileOperationDiagnostic(options: FileOperationDiagnosticOptions): LoggerDiagnosticInput {
  const {
    code,
    title,
    operation,
    targetKind,
    path,
    error,
    platform,
    exactFix,
    possibleFixes,
    details
  } = options
  const errorMessage = toErrorMessage(error)
  const blockingPath = targetKind === 'file' || targetKind === 'directory'
    ? resolveBlockingFilePath({path, targetKind, error})
    : void 0
  const advice = buildFileOperationAdvice({
    operation,
    targetKind,
    path,
    error,
    platform: platform ?? process.platform,
    ...blockingPath != null ? {blockingPath} : {}
  })

  return buildDiagnostic({
    code,
    title,
    rootCause: diagnosticLines(
      `Could not ${operation} the ${targetKind} at "${path}".`,
      `Error: ${errorMessage}`
    ),
    exactFix: exactFix ?? advice.exactFix,
    possibleFixes: possibleFixes ?? advice.possibleFixes,
    details: {
      operation,
      targetKind,
      path,
      errorMessage,
      platform: platform ?? process.platform,
      ...blockingPath != null ? {blockingPath} : {},
      ...details ?? {}
    }
  })
}

interface BatchFileOperationDiagnosticOptions {
  readonly code: string
  readonly title: string
  readonly operation: string
  readonly targetKind: string
  readonly failures: readonly DiagnosticFailure[]
  readonly exactFix?: DiagnosticLines | undefined
  readonly possibleFixes?: readonly DiagnosticLines[] | undefined
  readonly details?: Record<string, unknown> | undefined
}

export function buildBatchFileOperationDiagnostic(options: BatchFileOperationDiagnosticOptions): LoggerDiagnosticInput {
  const {
    code,
    title,
    operation,
    targetKind,
    failures,
    exactFix,
    possibleFixes,
    details
  } = options
  const firstFailure = failures[0]
  const firstFailureLine = firstFailure == null
    ? 'No failing path details were captured.'
    : `First failure: "${firstFailure.path}" -> ${toErrorMessage(firstFailure.error)}`

  return buildDiagnostic({
    code,
    title,
    rootCause: diagnosticLines(
      `${failures.length} ${operation} operation(s) failed while handling ${targetKind}.`,
      firstFailureLine
    ),
    exactFix: exactFix ?? diagnosticLines(
      `Fix the failing ${targetKind} path, then retry tnmsc.`
    ),
    possibleFixes: possibleFixes ?? [
      diagnosticLines('Verify the target path exists, has the expected type, and is accessible to tnmsc.'),
      diagnosticLines('Check whether another process deleted, moved, or locked the target path.')
    ],
    details: {
      operation,
      targetKind,
      failures: failures.map(failure => ({
        path: failure.path,
        errorMessage: toErrorMessage(failure.error),
        ...failure.details ?? {}
      })),
      ...details ?? {}
    }
  })
}

interface ConfigDiagnosticOptions {
  readonly code: string
  readonly title: string
  readonly reason: DiagnosticLines
  readonly configPath?: string | undefined
  readonly exactFix?: DiagnosticLines | undefined
  readonly possibleFixes?: readonly DiagnosticLines[] | undefined
  readonly details?: Record<string, unknown> | undefined
}

export function buildConfigDiagnostic(options: ConfigDiagnosticOptions): LoggerDiagnosticInput {
  const {
    code,
    title,
    reason,
    configPath,
    exactFix,
    possibleFixes,
    details
  } = options

  return buildDiagnostic({
    code,
    title,
    rootCause: configPath == null
      ? reason
      : diagnosticLines(reason[0], ...reason.slice(1), `Config path: ${configPath}`),
    exactFix,
    possibleFixes,
    details: {
      ...configPath != null ? {configPath} : {},
      ...details ?? {}
    }
  })
}

interface UsageDiagnosticOptions {
  readonly code: string
  readonly title: string
  readonly rootCause: DiagnosticLines
  readonly exactFix?: DiagnosticLines | undefined
  readonly possibleFixes?: readonly DiagnosticLines[] | undefined
  readonly details?: Record<string, unknown> | undefined
}

export function buildUsageDiagnostic(options: UsageDiagnosticOptions): LoggerDiagnosticInput {
  return buildDiagnostic(options)
}

interface PathStateDiagnosticOptions {
  readonly code: string
  readonly title: string
  readonly path: string
  readonly expectedKind: string
  readonly actualState: string
  readonly exactFix?: DiagnosticLines | undefined
  readonly possibleFixes?: readonly DiagnosticLines[] | undefined
  readonly details?: Record<string, unknown> | undefined
}

export function buildPathStateDiagnostic(options: PathStateDiagnosticOptions): LoggerDiagnosticInput {
  const {
    code,
    title,
    path,
    expectedKind,
    actualState,
    exactFix,
    possibleFixes,
    details
  } = options

  return buildDiagnostic({
    code,
    title,
    rootCause: diagnosticLines(
      `Expected a ${expectedKind} at "${path}".`,
      `Actual state: ${actualState}`
    ),
    exactFix: exactFix ?? diagnosticLines(
      `Create or replace "${path}" with a valid ${expectedKind} before retrying tnmsc.`
    ),
    possibleFixes: possibleFixes ?? [
      diagnosticLines('Check whether the path was moved, deleted, or replaced with the wrong file type.'),
      diagnosticLines('Update your configuration so tnmsc points to the intended source path.')
    ],
    details: {
      path,
      expectedKind,
      actualState,
      ...details ?? {}
    }
  })
}

interface PromptCompilerDiagnosticOptions {
  readonly code: string
  readonly title: string
  readonly diagnosticText: string
  readonly exactFix?: DiagnosticLines | undefined
  readonly possibleFixes?: readonly DiagnosticLines[] | undefined
  readonly details?: Record<string, unknown> | undefined
}

export function buildPromptCompilerDiagnostic(options: PromptCompilerDiagnosticOptions): LoggerDiagnosticInput {
  const {
    code,
    title,
    diagnosticText,
    exactFix,
    possibleFixes,
    details
  } = options

  const summaryLines = splitDiagnosticText(diagnosticText)

  return buildDiagnostic({
    code,
    title,
    rootCause: summaryLines,
    exactFix: exactFix ?? diagnosticLines(
      'Fix the referenced prompt source or compiled file, then rerun tnmsc.'
    ),
    possibleFixes: possibleFixes ?? [
      diagnosticLines('Open the file referenced in the diagnostic and correct the reported syntax or metadata issue.'),
      diagnosticLines('Rebuild the prompt output so the dist file matches the current source tree.')
    ],
    details: {
      diagnosticText,
      ...details ?? {}
    }
  })
}

export function buildProtectedDeletionDiagnostic(
  operation: string,
  violations: readonly ProtectedPathViolation[]
): LoggerDiagnosticInput {
  const firstViolation = violations[0]

  return buildDiagnostic({
    code: 'PROTECTED_DELETION_GUARD_TRIGGERED',
    title: 'Protected path blocked cleanup',
    rootCause: diagnosticLines(
      `"${operation}" targeted ${violations.length} protected path(s).`,
      firstViolation != null
        ? `Example protected path: ${firstViolation.protectedPath}`
        : 'No violation details were captured.'
    ),
    exactFix: diagnosticLines(
      'Remove protected inputs or reserved workspace paths from the delete plan before running tnmsc again.'
    ),
    possibleFixes: [
      diagnosticLines('Update cleanup declarations so they only target generated output paths.'),
      diagnosticLines('Move source inputs outside of the cleanup target set if they are currently overlapping.')
    ],
    details: {
      operation,
      count: violations.length,
      violations: violations.map(violation => ({
        targetPath: violation.targetPath,
        protectedPath: violation.protectedPath,
        protectionMode: violation.protectionMode,
        source: violation.source,
        reason: violation.reason
      }))
    }
  })
}

export function buildUnhandledExceptionDiagnostic(context: string, error: unknown): LoggerDiagnosticInput {
  const errorMessage = toErrorMessage(error)

  return buildDiagnostic({
    code: 'UNHANDLED_EXCEPTION',
    title: `Unexpected failure in ${context}`,
    rootCause: diagnosticLines(
      `An unhandled exception escaped the ${context} flow.`,
      `Error: ${errorMessage}`
    ),
    exactFix: diagnosticLines(
      'Inspect the failing code path, add the missing guard or validation, then retry the command.'
    ),
    possibleFixes: [
      diagnosticLines('Re-run the command with the same inputs after fixing the referenced file or configuration.'),
      diagnosticLines('Add a focused test that reproduces this failure so the regression stays covered.')
    ],
    details: {
      context,
      errorMessage
    }
  })
}

export type PublicLoggerDiagnosticRecord = Omit<LoggerDiagnosticRecord, 'level'>

function stripDiagnosticLevel(diagnostic: LoggerDiagnosticRecord): PublicLoggerDiagnosticRecord {
  const {level: _level, ...publicDiagnostic} = diagnostic
  return publicDiagnostic
}

export function partitionBufferedDiagnostics(
  diagnostics: readonly LoggerDiagnosticRecord[]
): {warnings: PublicLoggerDiagnosticRecord[], errors: PublicLoggerDiagnosticRecord[]} {
  const warnings: PublicLoggerDiagnosticRecord[] = []
  const errors: PublicLoggerDiagnosticRecord[] = []

  for (const diagnostic of diagnostics) {
    if (diagnostic.level === 'warn') warnings.push(stripDiagnosticLevel(diagnostic))
    else errors.push(stripDiagnosticLevel(diagnostic))
  }

  return {warnings, errors}
}
