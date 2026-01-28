import type {SkillResourceCategory} from 'memory-sync-cli/src/types/InputTypes'
import {SKILL_RESOURCE_BINARY_EXTENSIONS} from 'memory-sync-cli/src/types/InputTypes'

/**
 * Check if a file extension is a binary resource extension.
 *
 * @param ext - The file extension (including the dot)
 * @returns true if the extension is a binary type
 */
export function isBinaryResourceExtension(ext: string): boolean {
  return (SKILL_RESOURCE_BINARY_EXTENSIONS as readonly string[]).includes(ext.toLowerCase())
}

/**
 * Determine the resource category based on file extension.
 *
 * @param ext - The file extension (including the dot)
 * @returns The resource category
 */
export function getResourceCategory(ext: string): SkillResourceCategory {
  const lowerExt = ext.toLowerCase()

  const imageExtensions = [ // Image files
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.ico',
    '.bmp',
    '.tiff',
    '.svg'
  ]
  if (imageExtensions.includes(lowerExt)) return 'image'

  const codeExtensions = [ // Code files
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
  ]
  if (codeExtensions.includes(lowerExt)) return 'code'

  const dataExtensions = [ // Data files
    '.sql',
    '.json',
    '.jsonc',
    '.json5',
    '.xml',
    '.xsd',
    '.xsl',
    '.xslt',
    '.yaml',
    '.yml',
    '.toml',
    '.csv',
    '.tsv',
    '.graphql',
    '.gql',
    '.proto'
  ]
  if (dataExtensions.includes(lowerExt)) return 'data'

  const documentExtensions = [ // Document files
    '.txt',
    '.text',
    '.rtf',
    '.log',
    '.docx',
    '.doc',
    '.xlsx',
    '.xls',
    '.pptx',
    '.ppt',
    '.pdf',
    '.odt',
    '.ods',
    '.odp'
  ]
  if (documentExtensions.includes(lowerExt)) return 'document'

  const configExtensions = [ // Config files
    '.ini',
    '.conf',
    '.cfg',
    '.config',
    '.properties',
    '.env',
    '.envrc',
    '.editorconfig',
    '.gitignore',
    '.gitattributes',
    '.npmrc',
    '.nvmrc',
    '.npmignore',
    '.eslintrc',
    '.prettierrc',
    '.stylelintrc',
    '.babelrc',
    '.browserslistrc'
  ]
  if (configExtensions.includes(lowerExt)) return 'config'

  const scriptExtensions = [ // Script files
    '.sh',
    '.bash',
    '.zsh',
    '.fish',
    '.ps1',
    '.psm1',
    '.psd1',
    '.bat',
    '.cmd'
  ]
  if (scriptExtensions.includes(lowerExt)) return 'script'

  const binaryExtensions = [ // Binary files
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
    '.sqlite3'
  ]
  if (binaryExtensions.includes(lowerExt)) return 'binary'

  return 'other'
}

/**
 * Get MIME type for a file extension.
 *
 * @param ext - The file extension (including the dot)
 * @returns The MIME type or void 0
 */
export function getMimeType(ext: string): string | void {
  const mimeTypes: Record<string, string> = {
    '.ts': 'text/typescript', // Code
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
    '.sql': 'application/sql', // Data
    '.xml': 'application/xml',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.toml': 'text/toml',
    '.csv': 'text/csv',
    '.graphql': 'application/graphql',
    '.txt': 'text/plain', // Documents
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.html': 'text/html', // Web
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png', // Images
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.bmp': 'image/bmp'
  }
  return mimeTypes[ext.toLowerCase()]
}
