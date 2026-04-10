export interface MissingCompiledPromptErrorOptions {
  readonly kind: string
  readonly name: string
  readonly sourcePath?: string
  readonly expectedDistPath: string
}

export class MissingCompiledPromptError extends Error {
  readonly kind: string

  readonly nameOfPrompt: string

  readonly sourcePath?: string

  readonly expectedDistPath: string

  constructor(options: MissingCompiledPromptErrorOptions) {
    const {kind, name, sourcePath, expectedDistPath} = options
    super([
      `Missing compiled dist prompt for ${kind} "${name}".`,
      ...sourcePath != null ? [`source: ${sourcePath}`] : [],
      `expected dist: ${expectedDistPath}`
    ].join(' '))
    this.name = 'MissingCompiledPromptError'
    this.kind = kind
    this.nameOfPrompt = name
    if (sourcePath != null) this.sourcePath = sourcePath
    this.expectedDistPath = expectedDistPath
  }
}

export class ResidualModuleSyntaxError extends Error {
  readonly filePath: string

  readonly lineNumber: number

  constructor(filePath: string, lineNumber: number, lineContent: string) {
    super(`Compiled prompt still contains residual module syntax at ${filePath}:${lineNumber}: ${lineContent.trim()}`)
    this.name = 'ResidualModuleSyntaxError'
    this.filePath = filePath
    this.lineNumber = lineNumber
  }
}

const CODE_FENCE_PATTERN = /^\s*(```|~~~)/u
const RESIDUAL_MODULE_SYNTAX_PATTERNS = [
  /^\s*export\s+default\b/u,
  /^\s*export\s+const\b/u,
  /^\s*import\b/u
]

export function assertNoResidualModuleSyntax(content: string, filePath: string): void {
  let activeFence: string | undefined
  const lines = content.split(/\r?\n/u)

  for (const [index, line] of lines.entries()) {
    const fenceMatch = CODE_FENCE_PATTERN.exec(line)
    if (fenceMatch?.[1] != null) {
      const marker = fenceMatch[1]
      if (activeFence == null) activeFence = marker
      else if (activeFence === marker) activeFence = void 0
      continue
    }

    if (activeFence != null) continue
    if (RESIDUAL_MODULE_SYNTAX_PATTERNS.some(pattern => pattern.test(line))) throw new ResidualModuleSyntaxError(filePath, index + 1, line)
  }
}
