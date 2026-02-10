import type { FC } from 'react'

import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'

// Configure Monaco to use inline workers instead of external files.
// Tauri's webview has no `module` global, so the default AMD loader fails.
self.MonacoEnvironment = {
  getWorker(_: unknown, label: string) {
    if (label === 'json') {
      return new jsonWorker()
    }
    return new editorWorker()
  },
}

loader.config({ monaco })

// ---- component below ----

import Editor, { type OnMount } from '@monaco-editor/react'
import { useCallback, useRef } from 'react'

import { useTheme } from '@/hooks/useTheme'

interface JsonEditorProps {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly readOnly?: boolean
}

const JsonEditor: FC<JsonEditorProps> = ({ value, onChange, readOnly = false }) => {
  const { resolved } = useTheme()
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)

  const handleMount: OnMount = useCallback((editor) => {
    editorRef.current = editor
  }, [])

  const handleChange = useCallback(
    (val: string | undefined) => {
      onChange(val ?? '')
    },
    [onChange],
  )

  return (
    <Editor
      height="100%"
      defaultLanguage="json"
      theme={resolved === 'dark' ? 'vs-dark' : 'vs'}
      value={value}
      onChange={handleChange}
      onMount={handleMount}
      options={{
        readOnly,
        minimap: { enabled: false },
        fontSize: 13,
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        formatOnPaste: true,
        formatOnType: true,
        wordWrap: 'on',
        padding: { top: 8, bottom: 8 },
      }}
    />
  )
}

export default JsonEditor
