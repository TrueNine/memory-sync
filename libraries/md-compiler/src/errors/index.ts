export interface CompilerDiagnosticPoint {
  readonly line: number
  readonly column: number
  readonly offset?: number | undefined
}

export interface CompilerDiagnosticPosition {
  readonly start: CompilerDiagnosticPoint
  readonly end?: CompilerDiagnosticPoint | undefined
}

export interface CompilerDiagnostic {
  readonly filePath?: string | undefined
  readonly line?: number | undefined
  readonly column?: number | undefined
  readonly endLine?: number | undefined
  readonly endColumn?: number | undefined
  readonly offset?: number | undefined
  readonly endOffset?: number | undefined
  readonly snippet?: string | undefined
  readonly sourceLine?: string | undefined
  readonly codeFrame?: string | undefined
  readonly expression?: string | undefined
  readonly exportName?: string | undefined
  readonly nodeType?: string | undefined
  readonly phase?: string | undefined
  readonly hint?: string | undefined
  readonly cause?: string | undefined
}

export interface CompilerDiagnosticContext {
  readonly filePath?: string | undefined
  readonly position?: CompilerDiagnosticPosition | undefined
  readonly sourceText?: string | undefined
  readonly expression?: string | undefined
  readonly exportName?: string | undefined
  readonly nodeType?: string | undefined
  readonly phase?: string | undefined
  readonly hint?: string | undefined
  readonly cause?: string | undefined
}

export interface FormatCompilerDiagnosticOptions {
  readonly summary?: string
}

const MAX_SNIPPET_LENGTH = 240

export function createCompilerDiagnostic(context: CompilerDiagnosticContext = {}): CompilerDiagnostic {
  const {filePath, position, sourceText, expression, exportName, nodeType, phase, hint, cause} = context

  const line = position?.start.line
  const column = position?.start.column
  const endLine = position?.end?.line
  const endColumn = position?.end?.column
  const offset = position?.start.offset
  const endOffset = position?.end?.offset

  const sourceLine = line != null && sourceText != null
    ? getSourceLine(sourceText, line)
    : void 0
  const snippet = extractSnippet(sourceText, offset, endOffset, sourceLine)
  const codeFrame = line != null && column != null && sourceLine != null
    ? buildCodeFrame(line, column, endColumn, sourceLine)
    : void 0

  const diagnostic: CompilerDiagnostic = {}
  if (filePath != null && filePath.length > 0) Object.assign(diagnostic, {filePath})
  if (line != null) Object.assign(diagnostic, {line})
  if (column != null) Object.assign(diagnostic, {column})
  if (endLine != null) Object.assign(diagnostic, {endLine})
  if (endColumn != null) Object.assign(diagnostic, {endColumn})
  if (offset != null) Object.assign(diagnostic, {offset})
  if (endOffset != null) Object.assign(diagnostic, {endOffset})
  if (snippet != null && snippet.length > 0) Object.assign(diagnostic, {snippet})
  if (sourceLine != null && sourceLine.length > 0) Object.assign(diagnostic, {sourceLine})
  if (codeFrame != null && codeFrame.length > 0) Object.assign(diagnostic, {codeFrame})
  if (expression != null && expression.length > 0) Object.assign(diagnostic, {expression})
  if (exportName != null && exportName.length > 0) Object.assign(diagnostic, {exportName})
  if (nodeType != null && nodeType.length > 0) Object.assign(diagnostic, {nodeType})
  if (phase != null && phase.length > 0) Object.assign(diagnostic, {phase})
  if (hint != null && hint.length > 0) Object.assign(diagnostic, {hint})
  if (cause != null && cause.length > 0) Object.assign(diagnostic, {cause})
  return diagnostic
}

function getSourceLine(sourceText: string, lineNumber: number): string | undefined {
  const lines = sourceText.split(/\r?\n/u)
  return lines[lineNumber - 1]
}

function extractSnippet(
  sourceText: string | undefined,
  startOffset: number | undefined,
  endOffset: number | undefined,
  sourceLine: string | undefined
): string | undefined {
  if (sourceText != null && startOffset != null) {
    const safeEnd = endOffset != null && endOffset >= startOffset
      ? endOffset
      : startOffset + 1
    const raw = sourceText.slice(startOffset, safeEnd).trim()
    if (raw.length > 0) return raw.length > MAX_SNIPPET_LENGTH ? `${raw.slice(0, MAX_SNIPPET_LENGTH)}...` : raw
  }

  const trimmedLine = sourceLine?.trim()
  if (trimmedLine != null && trimmedLine.length > 0) return trimmedLine
  return void 0
}

function buildCodeFrame(
  lineNumber: number,
  startColumn: number,
  endColumn: number | undefined,
  sourceLine: string
): string {
  const gutter = `${lineNumber} | `
  const pointerIndent = ' '.repeat(gutter.length + Math.max(0, startColumn - 1))
  const pointerLength = Math.max(1, (endColumn ?? (startColumn + 1)) - startColumn)
  return `${gutter}${sourceLine}\n${pointerIndent}${'^'.repeat(pointerLength)}`
}

function formatLocation(diagnostic: CompilerDiagnostic): string | undefined {
  if (diagnostic.line == null || diagnostic.column == null) return void 0
  return diagnostic.endLine != null && diagnostic.endColumn != null
    ? `${diagnostic.line}:${diagnostic.column}-${diagnostic.endLine}:${diagnostic.endColumn}`
    : `${diagnostic.line}:${diagnostic.column}`
}

function formatDiagnosticMessage(summary: string, diagnostic: CompilerDiagnostic): string {
  const lines = [summary]

  if (diagnostic.phase != null) lines.push(`phase: ${diagnostic.phase}`)
  if (diagnostic.nodeType != null) lines.push(`node: ${diagnostic.nodeType}`)
  if (diagnostic.filePath != null) lines.push(`file: ${diagnostic.filePath}`)
  const location = formatLocation(diagnostic)
  if (location != null) lines.push(`location: ${location}`)
  if (diagnostic.expression != null) lines.push(`expression: ${diagnostic.expression}`)
  if (diagnostic.exportName != null) lines.push(`export: ${diagnostic.exportName}`)
  if (diagnostic.sourceLine != null) lines.push(`source line: ${diagnostic.sourceLine.trimEnd()}`)
  if (diagnostic.codeFrame != null) {
    lines.push('code frame:')
    lines.push(diagnostic.codeFrame)
  }
  if (diagnostic.hint != null) lines.push(`hint: ${diagnostic.hint}`)
  if (diagnostic.cause != null) lines.push(`cause: ${diagnostic.cause}`)

  return lines.join('\n')
}

export function formatCompilerDiagnostic(
  errorOrDiagnostic: Error | CompilerDiagnostic,
  options: FormatCompilerDiagnosticOptions = {}
): string {
  if (errorOrDiagnostic instanceof CompilerDiagnosticError) return errorOrDiagnostic.message
  if (errorOrDiagnostic instanceof Error) return errorOrDiagnostic.message

  const summary = options.summary ?? 'Compiler diagnostic'
  return formatDiagnosticMessage(summary, errorOrDiagnostic)
}

export class CompilerDiagnosticError extends Error {
  readonly diagnostic: CompilerDiagnostic

  readonly filePath?: string

  readonly line?: number

  readonly column?: number

  readonly endLine?: number

  readonly endColumn?: number

  readonly snippet?: string

  readonly sourceLine?: string

  readonly codeFrame?: string

  readonly phase?: string

  readonly nodeType?: string

  protected constructor(name: string, summary: string, diagnostic: CompilerDiagnostic) {
    super(formatDiagnosticMessage(summary, diagnostic))
    this.name = name
    this.diagnostic = diagnostic

    if (diagnostic.filePath != null) this.filePath = diagnostic.filePath
    if (diagnostic.line != null) this.line = diagnostic.line
    if (diagnostic.column != null) this.column = diagnostic.column
    if (diagnostic.endLine != null) this.endLine = diagnostic.endLine
    if (diagnostic.endColumn != null) this.endColumn = diagnostic.endColumn
    if (diagnostic.snippet != null) this.snippet = diagnostic.snippet
    if (diagnostic.sourceLine != null) this.sourceLine = diagnostic.sourceLine
    if (diagnostic.codeFrame != null) this.codeFrame = diagnostic.codeFrame
    if (diagnostic.phase != null) this.phase = diagnostic.phase
    if (diagnostic.nodeType != null) this.nodeType = diagnostic.nodeType
  }
}

function getExpressionHint(nodeType?: string): string | undefined {
  if (nodeType === 'mdxTextExpression' || nodeType === 'mdxFlowExpression') {
    return 'Literal braces in MDX text are parsed as expressions. Escape the braces or wrap the placeholder in code if you meant plain text.'
  }

  if (nodeType === 'mdxJsxAttributeValueExpression') return 'JSX attribute expressions must reference values that exist in scope.'

  return void 0
}

/**
 * Base class for scope-related errors
 */
export class ScopeError extends CompilerDiagnosticError {
  readonly expression?: string

  constructor(
    summary: string,
    diagnostic: CompilerDiagnostic
  ) {
    super('ScopeError', summary, diagnostic)
    if (diagnostic.expression != null) this.expression = diagnostic.expression
  }
}

/**
 * Undefined variable error
 * Error thrown when referencing an undefined variable in an expression
 */
export class UndefinedVariableError extends ScopeError {
  readonly variableName: string

  constructor(
    variableName: string,
    expression?: string,
    diagnosticContext: CompilerDiagnosticContext = {}
  ) {
    const diagnostic = createCompilerDiagnostic({
      ...diagnosticContext,
      expression,
      phase: diagnosticContext.phase ?? 'expression-evaluation',
      hint: diagnosticContext.hint ?? getExpressionHint(diagnosticContext.nodeType)
    })
    const summary = `Undefined variable "${variableName}" in expression "${expression ?? ''}"`
    super(summary, diagnostic)
    this.name = 'UndefinedVariableError'
    this.variableName = variableName
  }
}

/**
 * Undefined namespace error
 * Error thrown when referencing an undefined namespace in an expression
 */
export class UndefinedNamespaceError extends ScopeError {
  readonly namespace: string

  constructor(
    namespace: string,
    expression?: string,
    diagnosticContext: CompilerDiagnosticContext = {}
  ) {
    const diagnostic = createCompilerDiagnostic({
      ...diagnosticContext,
      expression,
      phase: diagnosticContext.phase ?? 'expression-evaluation',
      hint: diagnosticContext.hint ?? getExpressionHint(diagnosticContext.nodeType)
    })
    const summary = `Undefined namespace "${namespace}" in expression "${expression ?? ''}"`
    super(summary, diagnostic)
    this.name = 'UndefinedNamespaceError'
    this.namespace = namespace
  }
}

/**
 * Export parse error
 * Error thrown when an export statement cannot be parsed or statically evaluated
 */
export class ExportParseError extends CompilerDiagnosticError {
  readonly exportName?: string

  constructor(
    message: string,
    exportName?: string,
    diagnosticContext: CompilerDiagnosticContext = {}
  ) {
    const diagnostic = createCompilerDiagnostic({
      ...diagnosticContext,
      exportName,
      phase: diagnosticContext.phase ?? 'export-parsing',
      hint: diagnosticContext.hint
        ?? 'Export metadata must be statically evaluable. Use plain literals, arrays, objects, or scope-backed references only.'
    })
    super('ExportParseError', message, diagnostic)
    if (exportName != null) this.exportName = exportName
  }
}

/**
 * Metadata validation error
 * Error thrown when export metadata is missing required fields
 */
export class MetadataValidationError extends Error {
  constructor(
    readonly missingFields: readonly string[],
    readonly filePath?: string
  ) {
    const msg = filePath != null && filePath.length > 0
      ? `Missing required metadata fields: ${missingFields.join(', ')} (file: ${filePath})`
      : `Missing required metadata fields: ${missingFields.join(', ')}`
    super(msg)
    this.name = 'MetadataValidationError'
  }
}
