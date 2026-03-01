/**
 * File type categorization configuration
 * Centralizes extension definitions to reduce code duplication
 */

export interface FileTypeCategories {
  readonly image: readonly string[]
  readonly code: readonly string[]
  readonly data: readonly string[]
  readonly document: readonly string[]
  readonly config: readonly string[]
  readonly script: readonly string[]
  readonly binary: readonly string[]
}

export const FILE_TYPE_CATEGORIES: FileTypeCategories = {
  image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.tiff', '.svg'],
  code: [
    '.kt',
    '.java',
    '.py',
    '.pyi',
    '.pyx',
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.go',
    '.rs',
    '.c',
    '.cpp',
    '.cc',
    '.h',
    '.hpp',
    '.hxx',
    '.cs',
    '.fs',
    '.fsx',
    '.vb',
    '.rb',
    '.php',
    '.swift',
    '.scala',
    '.groovy',
    '.lua',
    '.r',
    '.jl',
    '.ex',
    '.exs',
    '.erl',
    '.clj',
    '.cljs',
    '.hs',
    '.ml',
    '.mli',
    '.nim',
    '.zig',
    '.v',
    '.dart',
    '.vue',
    '.svelte',
    '.d.ts',
    '.d.mts',
    '.d.cts'
  ],
  data: ['.sql', '.json', '.jsonc', '.json5', '.xml', '.xsd', '.xsl', '.xslt', '.yaml', '.yml', '.toml', '.csv', '.tsv', '.graphql', '.gql', '.proto'],
  document: ['.txt', '.text', '.rtf', '.log', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.pdf', '.odt', '.ods', '.odp'],
  config: ['.ini', '.conf', '.cfg', '.config', '.properties', '.env', '.envrc', '.editorconfig', '.gitignore', '.gitattributes', '.npmrc', '.nvmrc', '.npmignore', '.eslintrc', '.prettierrc', '.stylelintrc', '.babelrc', '.browserslistrc'],
  script: ['.sh', '.bash', '.zsh', '.fish', '.ps1', '.psm1', '.psd1', '.bat', '.cmd'],
  binary: ['.exe', '.dll', '.so', '.dylib', '.bin', '.wasm', '.class', '.jar', '.war', '.pyd', '.pyc', '.pyo', '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar', '.ttf', '.otf', '.woff', '.woff2', '.eot', '.db', '.sqlite', '.sqlite3']
} as const

export const SKILL_RESOURCE_BINARY_EXTENSIONS: readonly string[] = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.tiff',
  '.svg',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.wasm',
  '.class',
  '.jar',
  '.war',
  '.pyd',
  '.pyc',
  '.pyo',
  '.zip',
  '.tar',
  '.gz',
  '.bz2',
  '.7z',
  '.rar',
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
  '.eot',
  '.db',
  '.sqlite',
  '.sqlite3',
  '.pdf',
  '.docx',
  '.doc',
  '.xlsx',
  '.xls',
  '.pptx',
  '.ppt',
  '.odt',
  '.ods',
  '.odp'
] as const

export type ResourceCategory = 'image' | 'code' | 'data' | 'document' | 'config' | 'script' | 'binary' | 'other'
export type ResourceEncoding = 'text' | 'base64'

/**
 * Get resource category based on file extension
 */
export function getResourceCategory(ext: string): ResourceCategory {
  const lowerExt = ext.toLowerCase()

  if (FILE_TYPE_CATEGORIES.image.includes(lowerExt)) return 'image'
  if (FILE_TYPE_CATEGORIES.code.includes(lowerExt)) return 'code'
  if (FILE_TYPE_CATEGORIES.data.includes(lowerExt)) return 'data'
  if (FILE_TYPE_CATEGORIES.document.includes(lowerExt)) return 'document'
  if (FILE_TYPE_CATEGORIES.config.includes(lowerExt)) return 'config'
  if (FILE_TYPE_CATEGORIES.script.includes(lowerExt)) return 'script'
  if (FILE_TYPE_CATEGORIES.binary.includes(lowerExt)) return 'binary'

  return 'other'
}

/**
 * Check if extension is a binary resource type
 */
export function isBinaryResourceExtension(ext: string): boolean {
  return SKILL_RESOURCE_BINARY_EXTENSIONS.includes(ext.toLowerCase())
}

/**
 * Common MIME types for resources
 */
export const MIME_TYPES: Record<string, string> = {
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript',
  '.js': 'text/javascript',
  '.jsx': 'text/javascript',
  '.json': 'application/json',
  '.py': 'text/x-python',
  '.java': 'text/x-java',
  '.kt': 'text/x-kotlin',
  '.go': 'text/x-go',
  '.rs': 'text/x-rust',
  '.c': 'text/x-c',
  '.cpp': 'text/x-c++',
  '.cs': 'text/x-csharp',
  '.rb': 'text/x-ruby',
  '.php': 'text/x-php',
  '.swift': 'text/x-swift',
  '.scala': 'text/x-scala',
  '.sql': 'application/sql',
  '.xml': 'application/xml',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.toml': 'text/toml',
  '.csv': 'text/csv',
  '.graphql': 'application/graphql',
  '.txt': 'text/plain',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.html': 'text/html',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp'
} as const

/**
 * Get MIME type for file extension
 */
export function getMimeType(ext: string): string | undefined {
  return MIME_TYPES[ext.toLowerCase()]
}
