/**
 * Material Icon Theme — file & folder icon resolver.
 *
 * Uses the manifest from `material-icon-theme` to look up SVG icon URLs
 * for file names, extensions, and folder names.
 */
import { generateManifest } from 'material-icon-theme'

const manifest = generateManifest()

const fileNamesMap = new Map<string, string>(Object.entries(manifest.fileNames ?? {}))
const fileExtensionsMap = new Map<string, string>(Object.entries(manifest.fileExtensions ?? {}))
const languageIdsMap = new Map<string, string>(Object.entries(manifest.languageIds ?? {}))
const folderNamesMap = new Map<string, string>(Object.entries(manifest.folderNames ?? {}))
const folderNamesExpandedMap = new Map<string, string>(Object.entries(manifest.folderNamesExpanded ?? {}))

const defaultFileIcon = manifest.file ?? 'file'
const defaultFolderIcon = manifest.folder ?? 'folder'
const defaultFolderOpenIcon = manifest.folderExpanded ?? 'folder-open'

/** Map common file extensions to VS Code languageId for fallback lookup */
const extToLanguageId: ReadonlyMap<string, string> = new Map([
  ['ts', 'typescript'], ['tsx', 'typescriptreact'],
  ['js', 'javascript'], ['jsx', 'javascriptreact'],
  ['json', 'json'], ['yaml', 'yaml'], ['yml', 'yaml'],
  ['py', 'python'], ['rs', 'rust'], ['java', 'java'],
  ['css', 'css'], ['scss', 'scss'], ['less', 'less'],
  ['html', 'html'], ['xml', 'xml'], ['sql', 'sql'],
  ['md', 'markdown'], ['mdx', 'mdx'],
  ['c', 'c'], ['cpp', 'cpp'], ['h', 'c'], ['hpp', 'cpp'],
  ['go', 'go'], ['rb', 'ruby'], ['php', 'php'],
  ['swift', 'swift'], ['dart', 'dart'], ['lua', 'lua'],
  ['r', 'r'], ['sh', 'shellscript'], ['bash', 'shellscript'],
  ['ps1', 'powershell'], ['bat', 'bat'],
])

function iconUrl(iconName: string): string {
  return `/material-icons/${iconName}.svg`
}

/** Resolve icon URL for a file by its name (basename). */
export function getFileIconUrl(fileName: string): string {
  const lower = fileName.toLowerCase()

  // 1. Exact filename match (highest priority)
  const byName = fileNamesMap.get(lower)
  if (byName) return iconUrl(byName)

  // 2. Extension match — try compound extensions first (e.g. "cn.mdx"), then single
  const parts = lower.split('.')
  for (let i = 1; i < parts.length; i++) {
    const ext = parts.slice(i).join('.')
    const byExt = fileExtensionsMap.get(ext)
    if (byExt) return iconUrl(byExt)
  }

  // 3. LanguageId fallback — map extension to languageId, then look up
  const singleExt = parts.length > 1 ? parts[parts.length - 1]! : ''
  if (singleExt) {
    const langId = extToLanguageId.get(singleExt)
    if (langId) {
      const byLang = languageIdsMap.get(langId)
      if (byLang) return iconUrl(byLang)
    }
  }

  return iconUrl(defaultFileIcon)
}

/** Resolve icon URL for a folder by its name (basename). */
export function getFolderIconUrl(folderName: string, isOpen: boolean): string {
  const lower = folderName.toLowerCase()
  if (isOpen) {
    const expanded = folderNamesExpandedMap.get(lower)
    if (expanded) return iconUrl(expanded)
    return iconUrl(defaultFolderOpenIcon)
  }
  const closed = folderNamesMap.get(lower)
  if (closed) return iconUrl(closed)
  return iconUrl(defaultFolderIcon)
}
