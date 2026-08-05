import {compileMdx} from '../compiler/compiler'
import type {CompileDiagnostic} from '../compiler/types'

export interface PromptMetadataResult {
  metadata: Record<string, unknown>
  diagnostics: CompileDiagnostic[]
}

export type PromptSourceLoader = (path: string) => Promise<string>

const METADATA_DIAGNOSTIC_CODES = new Set([
  'invalid-frontmatter',
  'parse-error',
  'unsupported-export',
])

export class PromptMetadataCache {
  readonly #entries = new Map<string, Promise<PromptMetadataResult>>()

  constructor(private readonly loadSource: PromptSourceLoader) {}

  get(path: string): Promise<PromptMetadataResult> {
    const existing = this.#entries.get(path)
    if (existing != null) return existing

    const pending = this.loadSource(path)
      .then(source => {
        const result = compileMdx(source)
        return {
          metadata: result.metadata,
          diagnostics: result.diagnostics.filter(diagnostic => METADATA_DIAGNOSTIC_CODES.has(diagnostic.code)),
        }
      })
      .catch(error => ({
        metadata: {},
        diagnostics: [{
          severity: 'error' as const,
          code: 'source-read-error',
          message: error instanceof Error ? error.message : String(error),
        }],
      }))
    this.#entries.set(path, pending)
    return pending
  }

  invalidate(path: string): void {
    this.#entries.delete(path)
  }

  rename(oldPath: string, newPath: string): void {
    this.invalidate(oldPath)
    this.invalidate(newPath)
  }

  clear(): void {
    this.#entries.clear()
  }
}
