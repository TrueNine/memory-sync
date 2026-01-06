/**
 * Shadow Source Project validation and generation utilities
 */
import type { ILogger } from '@/log'
import type {
  ShadowSourceDirectoryEntry,
  ShadowSourceFileEntry,
  ShadowSourceProjectDirectory,
} from '@/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  DEFAULT_SHADOW_SOURCE_PROJECT_STRUCTURE,
  SHADOW_SOURCE_DIR_NAMES,
  SHADOW_SOURCE_FILE_NAMES,
  SHADOW_SOURCE_RELATIVE_PATHS,
} from '@/types'

/**
 * Version control check result
 */
export interface VersionControlCheckResult {
  readonly hasGit: boolean
  readonly gitPath: string
}

/**
 * Check if the shadow source project has version control (.git directory)
 * Logs info if .git exists, warns if not
 *
 * @param rootPath - Root path of the shadow source project
 * @param logger - Optional logger instance
 * @returns Version control check result
 */
export function checkVersionControl(
  rootPath: string,
  logger?: ILogger,
): VersionControlCheckResult {
  const gitPath = path.join(rootPath, '.git')
  const hasGit = fs.existsSync(gitPath)

  if (hasGit) logger?.info('version control detected', { path: gitPath })
  else logger?.warn('no version control detected, please use git to manage your shadow source project', { path: rootPath })

  return { hasGit, gitPath }
}

/**
 * Validation result for a single item (file or directory)
 */
export interface ValidationItem {
  readonly path: string
  readonly exists: boolean
  readonly required: boolean
  readonly type: 'file' | 'directory'
}

/**
 * Overall validation result
 */
export interface ValidationResult {
  readonly valid: boolean
  readonly rootPath: string
  readonly items: readonly ValidationItem[]
  readonly missingRequired: readonly ValidationItem[]
  readonly missingOptional: readonly ValidationItem[]
}

/**
 * Generation result
 */
export interface GenerationResult {
  readonly success: boolean
  readonly rootPath: string
  readonly createdDirs: readonly string[]
  readonly createdFiles: readonly string[]
  readonly existedDirs: readonly string[]
  readonly existedFiles: readonly string[]
}

/**
 * Validate shadow source project directory structure
 */
export function validateShadowSourceProject(
  rootPath: string,
  structure: ShadowSourceProjectDirectory = DEFAULT_SHADOW_SOURCE_PROJECT_STRUCTURE,
): ValidationResult {
  const items: ValidationItem[] = []

  // Validate src directories
  validateDirectory(rootPath, SHADOW_SOURCE_DIR_NAMES.SRC, structure.src.skills, items)
  validateDirectory(rootPath, SHADOW_SOURCE_DIR_NAMES.SRC, structure.src.commands, items)
  validateDirectory(rootPath, SHADOW_SOURCE_DIR_NAMES.SRC, structure.src.agents, items)
  validateFile(rootPath, SHADOW_SOURCE_RELATIVE_PATHS.SRC_GLOBAL_MEMORY, structure.src.globalMemoryFile, items)

  // Validate dist directories
  validateDirectory(rootPath, SHADOW_SOURCE_DIR_NAMES.DIST, structure.dist.skills, items)
  validateDirectory(rootPath, SHADOW_SOURCE_DIR_NAMES.DIST, structure.dist.commands, items)
  validateDirectory(rootPath, SHADOW_SOURCE_DIR_NAMES.DIST, structure.dist.agents, items)
  validateDirectory(rootPath, SHADOW_SOURCE_DIR_NAMES.DIST, structure.dist.app, items)
  validateFile(rootPath, SHADOW_SOURCE_RELATIVE_PATHS.DIST_GLOBAL_MEMORY, structure.dist.globalMemoryFile, items)

  // Validate app directory (standalone)
  validateDirectoryEntry(rootPath, structure.app, items)

  // Validate IDE directories
  validateDirectoryEntry(rootPath, structure.ide.idea, items)
  validateDirectoryEntry(rootPath, structure.ide.ideaCodeStyles, items)
  validateDirectoryEntry(rootPath, structure.ide.vscode, items)

  // Validate IDE files
  for (const file of structure.ideFiles) {
    validateFileEntry(rootPath, file, items)
  }

  // Validate ignore files
  for (const file of structure.ignoreFiles) {
    validateFileEntry(rootPath, file, items)
  }

  const missingRequired = items.filter(i => !i.exists && i.required)
  const missingOptional = items.filter(i => !i.exists && !i.required)

  return {
    valid: missingRequired.length === 0,
    rootPath,
    items,
    missingRequired,
    missingOptional,
  }
}

/**
 * Validate a directory under a parent path
 */
function validateDirectory(
  rootPath: string,
  parentDir: string,
  entry: ShadowSourceDirectoryEntry,
  items: ValidationItem[],
): void {
  const fullPath = path.join(rootPath, parentDir, entry.name)
  items.push({
    path: fullPath,
    exists: fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory(),
    required: entry.required,
    type: 'directory',
  })
}

/**
 * Validate a directory entry directly under root
 */
function validateDirectoryEntry(
  rootPath: string,
  entry: ShadowSourceDirectoryEntry,
  items: ValidationItem[],
): void {
  const fullPath = path.join(rootPath, entry.name)
  items.push({
    path: fullPath,
    exists: fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory(),
    required: entry.required,
    type: 'directory',
  })
}

/**
 * Validate a file at a relative path
 */
function validateFile(
  rootPath: string,
  relativePath: string,
  entry: ShadowSourceFileEntry,
  items: ValidationItem[],
): void {
  const fullPath = path.join(rootPath, relativePath)
  items.push({
    path: fullPath,
    exists: fs.existsSync(fullPath) && fs.statSync(fullPath).isFile(),
    required: entry.required,
    type: 'file',
  })
}

/**
 * Validate a file entry directly under root
 */
function validateFileEntry(
  rootPath: string,
  entry: ShadowSourceFileEntry,
  items: ValidationItem[],
): void {
  const fullPath = path.join(rootPath, entry.name)
  items.push({
    path: fullPath,
    exists: fs.existsSync(fullPath) && fs.statSync(fullPath).isFile(),
    required: entry.required,
    type: 'file',
  })
}

/**
 * Generation options
 */
export interface GenerationOptions {
  /** Source directory to copy config files from (if exists) */
  readonly sourceDir?: string
  /** Logger instance */
  readonly logger?: ILogger
}

/**
 * Generate shadow source project directory structure
 * If sourceDir is provided and contains config files, they will be copied instead of using defaults
 */
export function generateShadowSourceProject(
  rootPath: string,
  options: GenerationOptions = {},
): GenerationResult {
  const { sourceDir, logger } = options
  const createdDirs: string[] = []
  const createdFiles: string[] = []
  const existedDirs: string[] = []
  const existedFiles: string[] = []

  // Helper to read file from source or return default
  const getFileContent = (relativePath: string, defaultContent: string): string => {
    if (sourceDir == null) return defaultContent

    const sourcePath = path.join(sourceDir, relativePath)
    if (!(fs.existsSync(sourcePath) && fs.statSync(sourcePath).isFile())) return defaultContent

    logger?.debug('copying from source', { path: sourcePath })
    return fs.readFileSync(sourcePath, 'utf-8')
  }

  // Helper to create directory
  const ensureDir = (dirPath: string): void => {
    if (fs.existsSync(dirPath)) {
      existedDirs.push(dirPath)
      logger?.debug('directory exists', { path: dirPath })
    } else {
      fs.mkdirSync(dirPath, { recursive: true })
      createdDirs.push(dirPath)
      logger?.info('created directory', { path: dirPath })
    }
  }

  // Helper to create file with content from source or default
  const ensureFile = (filePath: string, relativePath: string, defaultContent: string): void => {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
      createdDirs.push(dir)
      logger?.info('created directory', { path: dir })
    }

    if (fs.existsSync(filePath)) {
      existedFiles.push(filePath)
      logger?.debug('file exists', { path: filePath })
    } else {
      const content = getFileContent(relativePath, defaultContent)
      fs.writeFileSync(filePath, content, 'utf-8')
      createdFiles.push(filePath)
      logger?.info('created file', { path: filePath })
    }
  }

  // Create root directory
  ensureDir(rootPath)

  // Create src directories
  ensureDir(path.join(rootPath, SHADOW_SOURCE_RELATIVE_PATHS.SRC_SKILLS))
  ensureDir(path.join(rootPath, SHADOW_SOURCE_RELATIVE_PATHS.SRC_COMMANDS))
  ensureDir(path.join(rootPath, SHADOW_SOURCE_RELATIVE_PATHS.SRC_AGENTS))

  // Create app directory (must be created before app/global.cn.mdx)
  ensureDir(path.join(rootPath, SHADOW_SOURCE_RELATIVE_PATHS.APP))

  // Create app/global.cn.mdx
  ensureFile(
    path.join(rootPath, SHADOW_SOURCE_RELATIVE_PATHS.SRC_GLOBAL_MEMORY),
    SHADOW_SOURCE_RELATIVE_PATHS.SRC_GLOBAL_MEMORY,
    '# Global Memory\n\n',
  )

  // Create dist directories
  ensureDir(path.join(rootPath, SHADOW_SOURCE_RELATIVE_PATHS.DIST_SKILLS))
  ensureDir(path.join(rootPath, SHADOW_SOURCE_RELATIVE_PATHS.DIST_COMMANDS))
  ensureDir(path.join(rootPath, SHADOW_SOURCE_RELATIVE_PATHS.DIST_AGENTS))
  ensureDir(path.join(rootPath, SHADOW_SOURCE_RELATIVE_PATHS.DIST_APP))

  // Create dist/global.mdx
  ensureFile(
    path.join(rootPath, SHADOW_SOURCE_RELATIVE_PATHS.DIST_GLOBAL_MEMORY),
    SHADOW_SOURCE_RELATIVE_PATHS.DIST_GLOBAL_MEMORY,
    '# Global Memory\n\n',
  )

  // Create IDE directories
  ensureDir(path.join(rootPath, SHADOW_SOURCE_DIR_NAMES.IDEA_CODE_STYLES))
  ensureDir(path.join(rootPath, SHADOW_SOURCE_DIR_NAMES.VSCODE))

  // Create IDE files
  ensureFile(
    path.join(rootPath, SHADOW_SOURCE_FILE_NAMES.EDITOR_CONFIG),
    SHADOW_SOURCE_FILE_NAMES.EDITOR_CONFIG,
    getDefaultEditorConfig(),
  )
  ensureFile(
    path.join(rootPath, SHADOW_SOURCE_FILE_NAMES.IDEA_GITIGNORE),
    SHADOW_SOURCE_FILE_NAMES.IDEA_GITIGNORE,
    getDefaultIdeaGitignore(),
  )
  ensureFile(
    path.join(rootPath, SHADOW_SOURCE_FILE_NAMES.IDEA_PROJECT_XML),
    SHADOW_SOURCE_FILE_NAMES.IDEA_PROJECT_XML,
    getDefaultProjectXml(),
  )
  ensureFile(
    path.join(rootPath, SHADOW_SOURCE_FILE_NAMES.IDEA_CODE_STYLE_CONFIG_XML),
    SHADOW_SOURCE_FILE_NAMES.IDEA_CODE_STYLE_CONFIG_XML,
    getDefaultCodeStyleConfigXml(),
  )
  ensureFile(
    path.join(rootPath, SHADOW_SOURCE_FILE_NAMES.VSCODE_SETTINGS),
    SHADOW_SOURCE_FILE_NAMES.VSCODE_SETTINGS,
    getDefaultVscodeSettings(),
  )
  ensureFile(
    path.join(rootPath, SHADOW_SOURCE_FILE_NAMES.VSCODE_EXTENSIONS),
    SHADOW_SOURCE_FILE_NAMES.VSCODE_EXTENSIONS,
    getDefaultVscodeExtensions(),
  )

  // Create ignore files
  ensureFile(
    path.join(rootPath, SHADOW_SOURCE_FILE_NAMES.QODER_IGNORE),
    SHADOW_SOURCE_FILE_NAMES.QODER_IGNORE,
    getDefaultIgnoreContent(),
  )
  ensureFile(
    path.join(rootPath, SHADOW_SOURCE_FILE_NAMES.CURSOR_IGNORE),
    SHADOW_SOURCE_FILE_NAMES.CURSOR_IGNORE,
    getDefaultIgnoreContent(),
  )
  ensureFile(
    path.join(rootPath, SHADOW_SOURCE_FILE_NAMES.WARP_INDEX_IGNORE),
    SHADOW_SOURCE_FILE_NAMES.WARP_INDEX_IGNORE,
    getDefaultIgnoreContent(),
  )

  return {
    success: true,
    rootPath,
    createdDirs,
    createdFiles,
    existedDirs,
    existedFiles,
  }
}

// Default file content generators

function getDefaultEditorConfig(): string {
  return `root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
`
}

function getDefaultIdeaGitignore(): string {
  return `# Default ignored files
/shelf/
/workspace.xml
`
}

function getDefaultProjectXml(): string {
  return `<component name="ProjectCodeStyleConfiguration">
  <state>
    <option name="USE_PER_PROJECT_SETTINGS" value="true" />
  </state>
</component>
`
}

function getDefaultCodeStyleConfigXml(): string {
  return `<component name="ProjectCodeStyleConfiguration">
  <code_scheme name="Project" version="173">
    <option name="LINE_SEPARATOR" value="&#10;" />
    <option name="SOFT_MARGINS" value="80,120" />
  </code_scheme>
</component>
`
}

function getDefaultVscodeSettings(): string {
  return JSON.stringify(
    {
      'editor.formatOnSave': true,
      'editor.tabSize': 2,
      'files.eol': '\n',
      'files.trimTrailingWhitespace': true,
      'files.insertFinalNewline': true,
    },
    null,
    2,
  )
}

function getDefaultVscodeExtensions(): string {
  return JSON.stringify(
    {
      recommendations: [],
    },
    null,
    2,
  )
}

function getDefaultIgnoreContent(): string {
  return __TEMPLATE_GITIGNORE__
}
