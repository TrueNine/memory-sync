import {compileMdx} from '../compiler/compiler'
import type {CompileDiagnostic} from '../compiler/types'

export interface ProcessPreviewSectionOptions {
  sourcePath: string
  source: string
  enabled: boolean
  nested: boolean
  scope: Record<string, unknown>
  render: (markdown: string) => Promise<void> | void
}

export interface ProcessPreviewSectionResult {
  handled: boolean
  diagnostics: CompileDiagnostic[]
}

export async function processPreviewSection(
  options: ProcessPreviewSectionOptions,
): Promise<ProcessPreviewSectionResult> {
  if (!options.enabled || options.nested || !options.sourcePath.toLowerCase().endsWith('.mdx')) {
    return {handled: false, diagnostics: []}
  }

  const compiled = compileMdx(options.source, options.scope)
  if (compiled.diagnostics.some(diagnostic => diagnostic.severity === 'error')) {
    return {handled: false, diagnostics: compiled.diagnostics}
  }

  try {
    await options.render(compiled.markdown)
    return {handled: true, diagnostics: compiled.diagnostics}
  } catch (error) {
    return {
      handled: false,
      diagnostics: [
        ...compiled.diagnostics,
        {
          severity: 'error',
          code: 'render-error',
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    }
  }
}
