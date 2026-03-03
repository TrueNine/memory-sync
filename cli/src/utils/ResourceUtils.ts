/**
 * Binary file extensions that should be read as base64
 */
const SKILL_RESOURCE_BINARY_EXTENSIONS = new Set([
  '.docx', // Documents
  '.doc',
  '.xlsx',
  '.xls',
  '.pptx',
  '.ppt',
  '.pdf',
  '.odt',
  '.ods',
  '.odp',
  '.png', // Images
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.tiff',
  '.zip', // Archives
  '.tar',
  '.gz',
  '.bz2',
  '.7z',
  '.rar',
  '.pyd', // Compiled
  '.pyc',
  '.pyo',
  '.class',
  '.jar',
  '.war',
  '.dll',
  '.so',
  '.dylib',
  '.exe',
  '.bin',
  '.wasm',
  '.ttf', // Fonts
  '.otf',
  '.woff',
  '.woff2',
  '.eot',
  '.mp3', // Audio/Video
  '.wav',
  '.ogg',
  '.mp4',
  '.webm',
  '.db', // Database
  '.sqlite',
  '.sqlite3'
])

/**
 * Check if a file extension is a binary resource extension.
 *
 * @param ext - The file extension (including the dot)
 * @returns true if the extension is a binary type
 */
export function isBinaryResourceExtension(ext: string): boolean {
  return SKILL_RESOURCE_BINARY_EXTENSIONS.has(ext.toLowerCase())
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
