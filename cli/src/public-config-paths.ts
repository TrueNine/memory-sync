import * as path from 'node:path'
import type {ProjectIDEConfigFile} from './plugins/plugin-core/InputTypes'
import {AINDEX_FILE_NAMES} from './plugins/plugin-core/AindexTypes'
import {FilePathKind, IDEKind} from './plugins/plugin-core/enums'

export const PUBLIC_CONFIG_DEFINITION_DIR = 'public'

export const PUBLIC_GIT_IGNORE_TARGET_RELATIVE_PATH = '.gitignore'
export const PUBLIC_GIT_EXCLUDE_TARGET_RELATIVE_PATH = '.git/info/exclude'

export const AI_AGENT_IGNORE_TARGET_RELATIVE_PATHS = [
  AINDEX_FILE_NAMES.QODER_IGNORE,
  AINDEX_FILE_NAMES.CURSOR_IGNORE,
  AINDEX_FILE_NAMES.WARP_INDEX_IGNORE,
  AINDEX_FILE_NAMES.AI_IGNORE,
  AINDEX_FILE_NAMES.CODEIUM_IGNORE,
  '.kiroignore',
  '.traeignore'
] as const

export const KNOWN_PUBLIC_CONFIG_TARGET_RELATIVE_PATHS = [
  AINDEX_FILE_NAMES.EDITOR_CONFIG,
  AINDEX_FILE_NAMES.VSCODE_SETTINGS,
  AINDEX_FILE_NAMES.VSCODE_EXTENSIONS,
  AINDEX_FILE_NAMES.IDEA_PROJECT_XML,
  AINDEX_FILE_NAMES.IDEA_CODE_STYLE_CONFIG_XML,
  AINDEX_FILE_NAMES.IDEA_GITIGNORE,
  ...AI_AGENT_IGNORE_TARGET_RELATIVE_PATHS
] as const

export function resolvePublicDefinitionPath(aindexDir: string, targetRelativePath: string): string {
  return path.join(aindexDir, PUBLIC_CONFIG_DEFINITION_DIR, ...targetRelativePath.split(/[\\/]+/))
}

export function collectKnownPublicConfigDefinitionPaths(aindexDir: string): string[] {
  return KNOWN_PUBLIC_CONFIG_TARGET_RELATIVE_PATHS.map(targetRelativePath => (
    resolvePublicDefinitionPath(aindexDir, targetRelativePath)
  ))
}

export function readPublicIdeConfigDefinitionFile<T extends IDEKind>(
  type: T,
  targetRelativePath: string,
  aindexDir: string,
  fs: typeof import('node:fs')
): ProjectIDEConfigFile<T> | undefined {
  const absolutePath = resolvePublicDefinitionPath(aindexDir, targetRelativePath)
  if (!(fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile())) return void 0

  const content = fs.readFileSync(absolutePath, 'utf8')
  return {
    type,
    content,
    length: content.length,
    filePathKind: FilePathKind.Absolute,
    dir: {
      pathKind: FilePathKind.Absolute,
      path: absolutePath,
      getDirectoryName: () => path.basename(absolutePath)
    }
  }
}
