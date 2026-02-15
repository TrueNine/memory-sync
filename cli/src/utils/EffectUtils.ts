import type {Buffer} from 'node:buffer'
import type {ILogger} from '@/log'
import type {InputEffectContext} from '@/types'
import process from 'node:process'

/**
 * Options for cleaning stale dist files.
 */
export interface CleanStaleDistOptions {
  /** Source directory (e.g., src/skills) */
  readonly srcDir: string
  /** Distribution directory (e.g., dist/skills) */
  readonly distDir: string
  /** File extension to match (default: '.md') */
  readonly extension?: string
  /** Whether to run in dry-run mode */
  readonly dryRun?: boolean
  /** Logger instance */
  readonly logger?: ILogger | undefined
}

/**
 * Result of cleaning stale dist files.
 */
export interface CleanStaleDistResult {
  /** Files that were deleted */
  readonly deletedFiles: string[]
  /** Files that would be deleted (dry-run mode) */
  readonly wouldDelete: string[]
  /** Errors encountered during deletion */
  readonly errors: {file: string, error: Error}[]
}

/**
 * Clean stale files in dist directory that don't have corresponding source files.
 * Compares dist directory against src directory and removes orphaned files.
 *
 * @param ctx - Effect context containing fs and path modules
 * @param options - Configuration options
 * @returns Result containing deleted files and any errors
 */
export function cleanStaleDistFiles(
  ctx: Pick<InputEffectContext, 'fs' | 'path' | 'logger'>,
  options: CleanStaleDistOptions
): CleanStaleDistResult {
  const {srcDir, distDir, extension = '.md', dryRun = false, logger} = options
  const {fs, path: nodePath} = ctx

  const result: CleanStaleDistResult = {
    deletedFiles: [],
    wouldDelete: [],
    errors: []
  }

  if (!fs.existsSync(distDir)) { // Check if directories exist
    logger?.debug({action: 'cleanStaleDistFiles', message: 'dist directory does not exist', distDir})
    return result
  }

  if (!fs.existsSync(srcDir)) {
    logger?.debug({action: 'cleanStaleDistFiles', message: 'src directory does not exist', srcDir})
    return result
  }

  const distEntries = fs.readdirSync(distDir, {withFileTypes: true}) // Get all files in dist directory

  for (const entry of distEntries) {
    if (entry.isDirectory()) {
      const srcSubDir = nodePath.join(srcDir, entry.name) // For directories, check if corresponding src directory exists
      const distSubDir = nodePath.join(distDir, entry.name)

      if (!fs.existsSync(srcSubDir)) {
        if (dryRun) { // Source directory doesn't exist, mark for deletion
          result.wouldDelete.push(distSubDir)
          logger?.debug({action: 'cleanStaleDistFiles', wouldDelete: distSubDir})
        } else {
          try {
            fs.rmSync(distSubDir, {recursive: true, force: true})
            result.deletedFiles.push(distSubDir)
            logger?.debug({action: 'cleanStaleDistFiles', deleted: distSubDir})
          }
          catch (error) {
            result.errors.push({file: distSubDir, error: error as Error})
            logger?.warn({action: 'cleanStaleDistFiles', error: (error as Error).message, file: distSubDir})
          }
        }
      } else {
        const subResult = cleanStaleDistFiles(ctx, { // Recursively clean subdirectory
          srcDir: srcSubDir,
          distDir: distSubDir,
          extension,
          dryRun,
          logger
        })
        result.deletedFiles.push(...subResult.deletedFiles)
        result.wouldDelete.push(...subResult.wouldDelete)
        result.errors.push(...subResult.errors)
      }
    } else if (entry.isFile() && entry.name.endsWith(extension)) {
      const distFilePath = nodePath.join(distDir, entry.name) // For files, check if corresponding src file exists

      const baseName = entry.name.replace(extension, '') // Convention: dist/foo.md -> src/foo/skill.md or src/foo.cn.mdx // Try to find corresponding source file
      const possibleSrcPaths = [
        nodePath.join(srcDir, baseName, 'skill.md'),
        nodePath.join(srcDir, `${baseName}.cn.mdx`),
        nodePath.join(srcDir, `${baseName}${extension}`),
        nodePath.join(srcDir, entry.name)
      ]

      const srcExists = possibleSrcPaths.some(p => fs.existsSync(p))

      if (!srcExists) {
        if (dryRun) {
          result.wouldDelete.push(distFilePath)
          logger?.debug({action: 'cleanStaleDistFiles', wouldDelete: distFilePath})
        } else {
          try {
            fs.unlinkSync(distFilePath)
            result.deletedFiles.push(distFilePath)
            logger?.debug({action: 'cleanStaleDistFiles', deleted: distFilePath})
          }
          catch (error) {
            result.errors.push({file: distFilePath, error: error as Error})
            logger?.warn({action: 'cleanStaleDistFiles', error: (error as Error).message, file: distFilePath})
          }
        }
      }
    }
  }

  return result
}

/**
 * Options for syncing directories.
 */
export interface SyncDirectoryOptions {
  /** Source directory */
  readonly srcDir: string
  /** Target directory */
  readonly targetDir: string
  /** File pattern to match (glob pattern) */
  readonly pattern?: string
  /** Whether to delete files in target that don't exist in source */
  readonly deleteOrphans?: boolean
  /** Whether to run in dry-run mode */
  readonly dryRun?: boolean
  /** Logger instance */
  readonly logger?: ILogger | undefined
}

/**
 * Result of directory sync operation.
 */
export interface SyncDirectoryResult {
  /** Files that were copied */
  readonly copiedFiles: string[]
  /** Files that were deleted (orphans) */
  readonly deletedFiles: string[]
  /** Errors encountered */
  readonly errors: {file: string, error: Error}[]
}

/**
 * Sync files from source directory to target directory.
 * Optionally removes orphaned files in target that don't exist in source.
 *
 * @param ctx - Effect context containing fs and path modules
 * @param options - Configuration options
 * @returns Result containing copied/deleted files and any errors
 */
export function syncDirectory(
  ctx: Pick<InputEffectContext, 'fs' | 'path' | 'logger'>,
  options: SyncDirectoryOptions
): SyncDirectoryResult {
  const {srcDir, targetDir, deleteOrphans = false, dryRun = false, logger} = options
  const {fs, path: nodePath} = ctx

  const result: SyncDirectoryResult = {
    copiedFiles: [],
    deletedFiles: [],
    errors: []
  }

  if (!dryRun && !fs.existsSync(targetDir)) fs.mkdirSync(targetDir, {recursive: true}) // Ensure target directory exists

  if (!fs.existsSync(srcDir)) { // Check if source exists
    logger?.debug({action: 'syncDirectory', message: 'source directory does not exist', srcDir})
    return result
  }

  const srcEntries = fs.readdirSync(srcDir, {withFileTypes: true}) // Get source files
  const srcNames = new Set(srcEntries.map(e => e.name))

  for (const entry of srcEntries) { // Copy files from source to target
    const srcPath = nodePath.join(srcDir, entry.name)
    const targetPath = nodePath.join(targetDir, entry.name)

    if (entry.isFile()) {
      if (!dryRun) {
        try {
          fs.copyFileSync(srcPath, targetPath)
          result.copiedFiles.push(targetPath)
          logger?.debug({action: 'syncDirectory', copied: targetPath})
        }
        catch (error) {
          result.errors.push({file: targetPath, error: error as Error})
        }
      } else result.copiedFiles.push(targetPath)
    } else if (entry.isDirectory()) {
      const subResult = syncDirectory(ctx, { // Recursively sync subdirectories
        srcDir: srcPath,
        targetDir: targetPath,
        deleteOrphans,
        dryRun,
        logger
      })
      result.copiedFiles.push(...subResult.copiedFiles)
      result.deletedFiles.push(...subResult.deletedFiles)
      result.errors.push(...subResult.errors)
    }
  }

  if (!(deleteOrphans && fs.existsSync(targetDir))) return result // Delete orphaned files in target

  const targetEntries = fs.readdirSync(targetDir, {withFileTypes: true})
  for (const entry of targetEntries) {
    if (!srcNames.has(entry.name)) {
      const targetPath = nodePath.join(targetDir, entry.name)
      if (!dryRun) {
        try {
          if (entry.isDirectory()) fs.rmSync(targetPath, {recursive: true, force: true})
          else fs.unlinkSync(targetPath)
          result.deletedFiles.push(targetPath)
          logger?.debug({action: 'syncDirectory', deleted: targetPath})
        }
        catch (error) {
          result.errors.push({file: targetPath, error: error as Error})
        }
      } else result.deletedFiles.push(targetPath)
    }
  }
  return result
}

/**
 * Options for executing a shell command as an effect.
 */
export interface ExecuteCommandOptions {
  /** Effect context containing spawn function */
  readonly ctx: Pick<InputEffectContext, 'spawn' | 'logger'>
  /** Command to execute */
  readonly command: string
  /** Arguments for the command */
  readonly args?: readonly string[]
  /** Working directory */
  readonly cwd?: string
  /** Environment variables */
  readonly env?: Record<string, string>
  /** Timeout in milliseconds */
  readonly timeout?: number
  /** Whether to run in dry-run mode */
  readonly dryRun?: boolean
}

/**
 * Result of command execution.
 */
export interface ExecuteCommandResult {
  /** Whether the command succeeded (exit code 0) */
  readonly success: boolean
  /** Exit code */
  readonly exitCode: number | null
  /** Standard output */
  readonly stdout: string
  /** Standard error */
  readonly stderr: string
  /** Error if command failed to execute */
  readonly error?: Error
}

/**
 * Execute a shell command as an effect.
 * Useful for running build scripts, compilers, etc.
 *
 * @param options - Command execution options
 * @returns Result containing output and exit code
 */
export async function executeCommand(options: ExecuteCommandOptions): Promise<ExecuteCommandResult> {
  const {ctx, command, args = [], cwd, env, timeout, dryRun = false} = options
  const {spawn: spawnFn, logger} = ctx

  if (dryRun) {
    logger?.debug({action: 'executeCommand', dryRun: true, command, args})
    return {
      success: true,
      exitCode: 0,
      stdout: '',
      stderr: ''
    }
  }

  return new Promise(resolve => {
    const proc = spawnFn(command, [...args], {
      cwd,
      env: {...process.env, ...env},
      shell: true,
      timeout
    })

    let stdout = ''
    let stderr = ''

    proc.stdout?.on('data', (data: Buffer) => stdout += data.toString())

    proc.stderr?.on('data', (data: Buffer) => stderr += data.toString())

    proc.on('error', error => {
      logger?.error({action: 'executeCommand', error: error.message, command})
      resolve({
        success: false,
        exitCode: null,
        stdout,
        stderr,
        error
      })
    })

    proc.on('close', code => {
      const success = code === 0
      if (success) logger?.debug({action: 'executeCommand', success: true, command})
      else logger?.warn({action: 'executeCommand', success: false, exitCode: code, command, stderr})
      resolve({success, exitCode: code, stdout, stderr})
    })
  })
}
