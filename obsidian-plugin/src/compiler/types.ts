export interface TnmsoSettings {
  compiledPreviewEnabled: boolean
  scope: Record<string, unknown>
}

export interface CompileDiagnostic {
  severity: 'warning' | 'error'
  code: string
  message: string
}

export interface CompileResult {
  markdown: string
  metadata: Record<string, unknown>
  diagnostics: CompileDiagnostic[]
}
