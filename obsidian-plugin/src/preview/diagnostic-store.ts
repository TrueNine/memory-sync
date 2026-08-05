import type {CompileDiagnostic} from '../compiler/types'

export class PreviewDiagnosticStore {
  readonly #paths = new Map<string, Map<string, CompileDiagnostic[]>>()

  set(path: string, section: string, diagnostics: CompileDiagnostic[]): void {
    const sections = this.#paths.get(path) ?? new Map<string, CompileDiagnostic[]>()
    if (diagnostics.length === 0) {
      sections.delete(section)
    } else {
      sections.set(section, diagnostics)
    }
    if (sections.size === 0) {
      this.#paths.delete(path)
    } else {
      this.#paths.set(path, sections)
    }
  }

  get(path: string): CompileDiagnostic[] {
    return [...(this.#paths.get(path)?.values() ?? [])].flat()
  }

  invalidate(path: string): void {
    this.#paths.delete(path)
  }

  rename(oldPath: string, newPath: string): void {
    this.invalidate(oldPath)
    this.invalidate(newPath)
  }

  clear(): void {
    this.#paths.clear()
  }
}
