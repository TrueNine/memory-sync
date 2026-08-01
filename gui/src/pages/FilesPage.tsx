import type { FC } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { OnMount } from '@monaco-editor/react'
import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

import { ChevronDown, ChevronRight, RefreshCw, Save } from 'lucide-react'

import type { AindexFileEntry } from '@/api/bridge'
import { listCategoryFiles, readAindexFile, writeAindexFile } from '@/api/bridge'
import { useToast } from '@/components/Toaster'
import { useFont } from '@/hooks/useFont'
import { useTheme } from '@/hooks/useTheme'
import { useI18n } from '@/i18n'
import { getFileIconUrl, getFolderIconUrl } from '@/lib/file-icons'
import { cn } from '@/lib/utils'
import { FILE_CATEGORY_TABS, fileCategoryRootPrefix, type FileCategory } from '@/pages/files-page-categories'
import { registerVitesseThemes, vitesseTheme } from '@/themes'

// Monaco setup — reuse worker config, register MDX as markdown variant
self.MonacoEnvironment = {
  getWorker() {
    return new editorWorker()
  },
}
loader.config({ monaco })
registerVitesseThemes()

// Register mdx as a language aliased to markdown for syntax highlighting
monaco.languages.register({ id: 'mdx', extensions: ['.mdx', '.src.mdx'], aliases: ['MDX'] })
// Use markdown tokenizer for mdx
const mdLangDef = (monaco.languages as unknown as Record<string, unknown>)['_languages']
if (!mdLangDef) {
  // Fallback: set mdx language configuration to match markdown
  monaco.languages.setLanguageConfiguration('mdx', {
    comments: { blockComment: ['<!--', '-->'] },
    brackets: [['{', '}'], ['[', ']'], ['(', ')']],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '`', close: '`' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  })
}

// ---------------------------------------------------------------------------
// File tree types and helpers
// ---------------------------------------------------------------------------

interface TreeNode {
  readonly name: string
  readonly path: string
  readonly isDir: boolean
  readonly children: TreeNode[]
  readonly entry?: AindexFileEntry
}

function buildTree(entries: readonly AindexFileEntry[], rootPrefix: string): TreeNode {
  const root: TreeNode = { name: rootPrefix, path: rootPrefix, isDir: true, children: [] }
  const dirs = new Map<string, TreeNode>()
  dirs.set('', root)

  for (const entry of entries) {
    const normalizedSourcePath = entry.sourcePath.startsWith(`${rootPrefix}/`)
      ? entry.sourcePath.slice(rootPrefix.length + 1)
      : entry.sourcePath
    const parts = normalizedSourcePath.split('/').filter(part => part.length > 0)
    if (parts.length === 0) continue

    // Ensure all parent dirs exist
    for (let i = 0; i < parts.length - 1; i++) {
      const dirPath = parts.slice(0, i + 1).join('/')
      if (!dirs.has(dirPath)) {
        const node: TreeNode = { name: parts[i]!, path: dirPath, isDir: true, children: [] }
        dirs.set(dirPath, node)
        const parentPath = parts.slice(0, i).join('/')
        const parent = dirs.get(parentPath)
        if (parent) (parent.children as TreeNode[]).push(node)
      }
    }
    // Add file node
    const fileName = parts[parts.length - 1]!
    const parentPath = parts.slice(0, -1).join('/')
    const parent = dirs.get(parentPath)
    const fileNode: TreeNode = { name: fileName, path: entry.sourcePath, isDir: false, children: [], entry }
    if (parent) (parent.children as TreeNode[]).push(fileNode)
  }

  // Sort: dirs first, then files, alphabetically
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const n of nodes) if (n.isDir) sortNodes(n.children as TreeNode[])
  }
  sortNodes(root.children as TreeNode[])
  return root
}

function countStats(text: string): { chars: number; lines: number } {
  return { chars: text.length, lines: text === '' ? 0 : text.split('\n').length }
}

/** Infer Monaco editor language from file extension */
function inferLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    json: 'json', ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    md: 'markdown', mdx: 'mdx', html: 'html', css: 'css', scss: 'scss',
    yaml: 'yaml', yml: 'yaml', toml: 'ini', xml: 'xml', sql: 'sql',
    rs: 'rust', py: 'python', java: 'java', kt: 'kotlin', kts: 'kotlin',
    vue: 'html', svelte: 'html', sh: 'shell', bash: 'shell',
    properties: 'ini', gradle: 'kotlin',
  }
  return map[ext] ?? 'plaintext'
}

// ---------------------------------------------------------------------------
// Tree item component
// ---------------------------------------------------------------------------

interface TreeItemProps {
  readonly node: TreeNode
  readonly depth: number
  readonly selected: string | null
  readonly expanded: ReadonlySet<string>
  readonly onSelect: (entry: AindexFileEntry) => void
  readonly onToggle: (path: string) => void
}

const TreeItem: FC<TreeItemProps> = ({ node, depth, selected, expanded, onSelect, onToggle }) => {
  if (node.isDir) {
    const isOpen = expanded.has(node.path)
    return (
      <>
        <button
          type="button"
          onClick={() => onToggle(node.path)}
          className={cn(
            'flex w-full items-center gap-1 rounded px-1 py-0.5 text-xs hover:bg-accent/50',
          )}
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          {isOpen ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
          <img src={getFolderIconUrl(node.name, isOpen)} alt="" className="h-4 w-4 shrink-0" />
          <span className="truncate">{node.name}</span>
        </button>
        {isOpen && node.children.map((child) => (
          <TreeItem
            key={child.path}
            node={child}
            depth={depth + 1}
            selected={selected}
            expanded={expanded}
            onSelect={onSelect}
            onToggle={onToggle}
          />
        ))}
      </>
    )
  }

  const isActive = selected === node.entry?.sourcePath
  return (
    <button
      type="button"
      onClick={() => node.entry && onSelect(node.entry)}
      className={cn(
        'flex w-full items-center gap-1 rounded px-1 py-0.5 text-xs',
        isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
      )}
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
      title={node.path}
    >
      <img src={getFileIconUrl(node.name)} alt="" className="h-4 w-4 shrink-0" />
      <span className="truncate">{node.name}</span>
    </button>
  )
}

// ---------------------------------------------------------------------------
// MDX Editor pane
// ---------------------------------------------------------------------------

interface EditorPaneProps {
  readonly label: string
  readonly fileName: string
  readonly value: string
  readonly original: string
  readonly onChange: (v: string) => void
  readonly onSave: () => void
  readonly saving: boolean
  readonly t: (key: string) => string
  readonly theme: string
  readonly fontFamily: string
  readonly language?: string
  readonly readOnly?: boolean
  readonly onEditorMount?: (editor: Parameters<OnMount>[0]) => void
}

const EditorPane: FC<EditorPaneProps> = ({ label, fileName, value, original, onChange, onSave, saving, t, theme, fontFamily, language = 'mdx', readOnly = false, onEditorMount }) => {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const isDirty = value !== original
  const stats = useMemo(() => countStats(value), [value])

  const handleMount: OnMount = useCallback((editor) => {
    editorRef.current = editor
    onEditorMount?.(editor)
  }, [onEditorMount])

  return (
    <div className="flex min-w-0 flex-1 flex-col border border-border rounded-lg overflow-hidden">
      {/* Pane header */}
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <img src={getFileIconUrl(fileName)} alt="" className="h-4 w-4 shrink-0" />
          <span className="text-xs font-medium">{label}</span>
          {isDirty && <span className="text-xs text-amber-500">● {t('files.unsaved')}</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground">
            {stats.chars} {t('files.chars')} · {stats.lines} {t('files.lines')}
          </span>
          <button
            type="button"
            onClick={onSave}
            disabled={!isDirty || saving}
            className={cn(
              'inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium transition-colors',
              'bg-primary text-primary-foreground hover:bg-primary/90',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            <Save className="h-3 w-3" />
            {saving ? t('files.saving') : t('files.save')}
          </button>
        </div>
      </div>
      {/* Editor */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={language}
          theme={vitesseTheme(theme)}
          value={value}
          onChange={(v) => onChange(v ?? '')}
          onMount={handleMount}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily,
            fontLigatures: true,
            lineNumbers: 'on',
            readOnly,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: 'off',
            padding: { top: 8, bottom: 8 },
            scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
          }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const FilesPage: FC = () => {
  const { t } = useI18n()
  const { toast } = useToast()
  const { resolved } = useTheme()
  const { fontCss } = useFont()

  const [category, setCategory] = useState<FileCategory>('app')
  const [files, setFiles] = useState<readonly AindexFileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<AindexFileEntry | null>(null)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set<string>())

  // Editor state
  const [sourceContent, setSourceContent] = useState('')
  const [sourceOriginal, setSourceOriginal] = useState('')
  const [translatedContent, setTranslatedContent] = useState('')
  const [translatedOriginal, setTranslatedOriginal] = useState('')
  const [savingSource, setSavingSource] = useState(false)
  const [savingTranslated, setSavingTranslated] = useState(false)

  // Scroll sync between editors
  type MonacoEditor = Parameters<OnMount>[0]
  const sourceEditorRef = useRef<MonacoEditor | null>(null)
  const translatedEditorRef = useRef<MonacoEditor | null>(null)
  const isSyncing = useRef(false)

  const handleSourceEditorMount = useCallback((editor: MonacoEditor) => {
    sourceEditorRef.current = editor
    editor.onDidScrollChange((e) => {
      if (isSyncing.current || !translatedEditorRef.current) return
      isSyncing.current = true
      translatedEditorRef.current.setScrollTop(e.scrollTop)
      translatedEditorRef.current.setScrollLeft(e.scrollLeft)
      isSyncing.current = false
    })
  }, [])

  const handleTranslatedEditorMount = useCallback((editor: MonacoEditor) => {
    translatedEditorRef.current = editor
    editor.onDidScrollChange((e) => {
      if (isSyncing.current || !sourceEditorRef.current) return
      isSyncing.current = true
      sourceEditorRef.current.setScrollTop(e.scrollTop)
      sourceEditorRef.current.setScrollLeft(e.scrollLeft)
      isSyncing.current = false
    })
  }, [])

  const cwd = '.'

  const fetchFiles = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listCategoryFiles(cwd, category)
      setFiles(result)
    } catch (e) {
      console.error(`[FilesPage] fetchFiles(${category}) failed:`, e)
    } finally {
      setLoading(false)
    }
  }, [category])

  useEffect(() => { fetchFiles() }, [fetchFiles])

  const treeRootPrefix = useMemo(() => fileCategoryRootPrefix(category), [category])
  const tree = useMemo(() => buildTree(files, treeRootPrefix), [files, treeRootPrefix])

  const handleSelect = useCallback(async (entry: AindexFileEntry) => {
    setSelected(entry)
    try {
      if (entry.fileType === 'resource') {
        const src = await readAindexFile(cwd, entry.sourcePath)
        setSourceContent(src)
        setSourceOriginal(src)
        setTranslatedContent('')
        setTranslatedOriginal('')
      } else {
        const [src, trans] = await Promise.all([
          readAindexFile(cwd, entry.sourcePath),
          readAindexFile(cwd, entry.translatedPath),
        ])
        setSourceContent(src)
        setSourceOriginal(src)
        setTranslatedContent(trans)
        setTranslatedOriginal(trans)
      }
    } catch (err) {
      console.error('[FilesPage] handleSelect failed:', err)
      toast(t('files.loadFailed'))
    }
  }, [])

  const handleToggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const handleSaveSource = useCallback(async () => {
    if (!selected) return
    setSavingSource(true)
    try {
      await writeAindexFile(cwd, selected.sourcePath, sourceContent)
      setSourceOriginal(sourceContent)
    } catch (err) {
      console.error('[FilesPage] handleSaveSource failed:', err)
      toast(t('files.saveFailed'))
    } finally {
      setSavingSource(false)
    }
  }, [selected, sourceContent])

  const handleSaveTranslated = useCallback(async () => {
    if (!selected) return
    setSavingTranslated(true)
    try {
      await writeAindexFile(cwd, selected.translatedPath, translatedContent)
      setTranslatedOriginal(translatedContent)
    } catch (err) {
      console.error('[FilesPage] handleSaveTranslated failed:', err)
      toast(t('files.saveFailed'))
    } finally {
      setSavingTranslated(false)
    }
  }, [selected, translatedContent])

  const handleCategoryChange = useCallback((cat: FileCategory) => {
    setCategory(cat)
    setSelected(null)
    setExpanded(new Set<string>())
    setSourceContent('')
    setSourceOriginal('')
    setTranslatedContent('')
    setTranslatedOriginal('')
  }, [])

  return (
    <div className="flex h-full gap-0 -m-6">
      {/* File tree sidebar */}
      <div className="flex w-56 shrink-0 flex-col border-r border-border bg-muted/30">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-xs font-semibold">{t('files.title')}</span>
          <button
            type="button"
            onClick={fetchFiles}
            disabled={loading}
            className="p-0.5 text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
          </button>
        </div>
        {/* Category tabs */}
        <div className="flex border-b border-border">
          {FILE_CATEGORY_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => handleCategoryChange(tab.value)}
              className={cn(
                'flex-1 px-1 py-1.5 text-[10px] font-medium transition-colors',
                category === tab.value
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-1 py-1">
          {tree.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={0}
              selected={selected?.sourcePath ?? null}
              expanded={expanded}
              onSelect={handleSelect}
              onToggle={handleToggle}
            />
          ))}
          {files.length === 0 && !loading && (
            <p className="px-2 py-4 text-xs text-muted-foreground">{t('files.noFile')}</p>
          )}
        </div>
      </div>

      {/* Editor area */}
      <div className="flex flex-1 min-w-0 flex-col">
        {selected ? (
          <div className="flex flex-1 min-h-0 gap-1 p-2">
            {selected.fileType === 'resource' ? (
              /* Single pane for resource files */
              <EditorPane
                label={selected.sourcePath.split('/').pop() ?? ''}
                fileName={selected.sourcePath.split('/').pop() ?? ''}
                value={sourceContent}
                original={sourceOriginal}
                onChange={setSourceContent}
                onSave={handleSaveSource}
                saving={savingSource}
                t={t}
                theme={resolved}
                fontFamily={fontCss}
                language={inferLanguage(selected.sourcePath)}
                readOnly
              />
            ) : (
              /* Dual pane for .src.mdx source + translated */
              <>
                <EditorPane
                  label={`${t('files.source')} — ${selected.sourcePath.split('/').pop() ?? ''}`}
                  fileName={selected.sourcePath.split('/').pop() ?? ''}
                  value={sourceContent}
                  original={sourceOriginal}
                  onChange={setSourceContent}
                  onSave={handleSaveSource}
                  saving={savingSource}
                  t={t}
                  theme={resolved}
                  fontFamily={fontCss}
                  onEditorMount={handleSourceEditorMount}
                />
                <EditorPane
                  label={`${t('files.translated')} — ${selected.translatedPath.split('/').pop() ?? ''}`}
                  fileName={selected.translatedPath.split('/').pop() ?? ''}
                  value={translatedContent}
                  original={translatedOriginal}
                  onChange={setTranslatedContent}
                  onSave={handleSaveTranslated}
                  saving={savingTranslated}
                  t={t}
                  theme={resolved}
                  fontFamily={fontCss}
                  onEditorMount={handleTranslatedEditorMount}
                />
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">{t('files.noFile')}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default FilesPage
