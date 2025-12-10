/**
 * Output blocking implementation
 * Evaluates conditions before emitting files and blocks output when conditions are not met
 *
 * @see Requirements 16.1, 16.2, 16.3, 16.4
 */

import type {
  BlockedOutput,
  EmittedFile,
  OutputCondition,
  OutputConditionResult,
  PluginContext,
  PluginOutput,
} from './types'
import { exec } from 'node:child_process'
import nodeProcess from 'node:process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

/**
 * Check if a tool is installed on the system
 * Uses 'which' on Unix-like systems and 'where' on Windows
 *
 * @param toolName - Name of the tool to check
 * @returns True if tool is installed, false otherwise
 * @see Requirement 16.3
 */
async function isToolInstalled(toolName: string): Promise<boolean> {
  const isWindows = nodeProcess.platform === 'win32'
  const command = isWindows ? `where ${toolName}` : `which ${toolName}`

  try {
    await execAsync(command)
    return true
  } catch {
    return false
  }
}

/**
 * Evaluate a single output condition
 *
 * @param condition - Condition to evaluate
 * @param ctx - Plugin context for accessing file system and other utilities
 * @returns Result indicating if condition was met and reason
 * @see Requirements 16.1, 16.3
 */
export async function evaluateCondition(
  condition: OutputCondition,
  ctx: PluginContext,
): Promise<OutputConditionResult> {
  switch (condition.type) {
    case 'toolInstalled': {
      const tool = condition.params?.['tool']
      if (typeof tool !== 'string' || tool.trim() === '') {
        return {
          met: false,
          reason: 'Invalid toolInstalled condition: missing or invalid tool parameter',
        }
      }

      const installed = await isToolInstalled(tool)
      return {
        met: installed,
        reason: installed
          ? `Tool "${tool}" is installed`
          : `Tool "${tool}" is not installed`,
      }
    }

    case 'configExists': {
      const configPath = condition.params?.['path']
      if (typeof configPath !== 'string' || configPath.trim() === '') {
        return {
          met: false,
          reason: 'Invalid configExists condition: missing or invalid path parameter',
        }
      }

      const exists = await ctx.fs.exists(configPath)
      return {
        met: exists,
        reason: exists
          ? `Config file "${configPath}" exists`
          : `Config file "${configPath}" does not exist`,
      }
    }

    case 'custom': {
      if (typeof condition.check !== 'function') {
        return {
          met: false,
          reason: 'Invalid custom condition: missing check function',
        }
      }

      try {
        const result = await condition.check(ctx)
        return {
          met: result,
          reason: result
            ? 'Custom condition met'
            : 'Custom condition not met',
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          met: false,
          reason: `Custom condition check failed: ${message}`,
        }
      }
    }

    default: {
      return {
        met: false,
        reason: `Unknown condition type: ${String(condition.type)}`,
      }
    }
  }
}

/**
 * Evaluate all conditions for a plugin output
 * All conditions must be met for output to proceed
 *
 * @param output - Plugin output configuration with conditions
 * @param ctx - Plugin context
 * @returns Result with combined evaluation
 * @see Requirement 16.1
 */
export async function evaluateOutputConditions(
  output: PluginOutput,
  ctx: PluginContext,
): Promise<OutputConditionResult> {
  const conditions = output.conditions
  if (conditions == null || conditions.length === 0) {
    return { met: true, reason: 'No conditions to evaluate' }
  }

  for (const condition of conditions) {
    const result = await evaluateCondition(condition, ctx)
    if (!result.met) {
      return result
    }
  }

  return { met: true, reason: 'All conditions met' }
}

/**
 * Check if an emitted file should be blocked based on output conditions
 * Marks the file as blocked and sets the block reason if conditions are not met
 *
 * @param file - Emitted file to check
 * @param output - Plugin output configuration
 * @param ctx - Plugin context
 * @returns Updated emitted file with blocked status
 * @see Requirements 16.2, 16.4
 */
export async function checkFileBlocking(
  file: EmittedFile,
  output: PluginOutput,
  ctx: PluginContext,
): Promise<EmittedFile> {
  const result = await evaluateOutputConditions(output, ctx)

  if (!result.met) {
    ctx.log.info(`Output blocked for "${file.fileName}": ${result.reason}`)
    return {
      ...file,
      blocked: true,
      blockReason: result.reason,
    }
  }

  return file
}

/**
 * Filter emitted files, removing blocked files and logging reasons
 * Prevents empty or partial files from being created
 *
 * @param files - Array of emitted files
 * @param ctx - Plugin context for logging
 * @returns Array of non-blocked files
 * @see Requirements 16.2, 16.4
 */
export function filterBlockedFiles(
  files: EmittedFile[],
  ctx: PluginContext,
): EmittedFile[] {
  const nonBlocked: EmittedFile[] = []
  const blocked: BlockedOutput[] = []

  for (const file of files) {
    if (file.blocked === true) {
      blocked.push({
        fileName: file.fileName,
        reason: file.blockReason ?? 'Unknown reason',
        condition: { type: 'custom' },
      })
    } else {
      nonBlocked.push(file)
    }
  }

  // Log blocked files summary
  if (blocked.length > 0) {
    ctx.log.info(`Blocked ${blocked.length} file(s) from emission:`)
    for (const item of blocked) {
      ctx.log.debug(`  - ${item.fileName}: ${item.reason}`)
    }
  }

  return nonBlocked
}

/**
 * Validate that a file has content (not empty or partial)
 * Blocks files that would result in empty output
 *
 * @param file - Emitted file to validate
 * @returns True if file has valid content, false otherwise
 * @see Requirement 16.4
 */
export function validateFileContent(file: EmittedFile): boolean {
  // Check for empty source
  if (file.source == null || file.source.trim() === '') {
    return false
  }

  return true
}

/**
 * Block files with empty or invalid content
 * Prevents empty or partial files from being created
 *
 * @param files - Array of emitted files
 * @param ctx - Plugin context for logging
 * @returns Array of files with empty ones marked as blocked
 * @see Requirement 16.4
 */
export function blockEmptyFiles(
  files: EmittedFile[],
  ctx: PluginContext,
): EmittedFile[] {
  return files.map((file) => {
    if (file.blocked === true) {
      return file
    }

    if (!validateFileContent(file)) {
      ctx.log.warn(`Blocking empty file: ${file.fileName}`)
      return {
        ...file,
        blocked: true,
        blockReason: 'File content is empty or invalid',
      }
    }

    return file
  })
}

/**
 * Output blocker class for managing output blocking logic
 * Provides methods for evaluating conditions and filtering blocked files
 *
 * @see Requirements 16.1, 16.2, 16.3, 16.4
 */
export class OutputBlocker {
  private ctx: PluginContext

  constructor(ctx: PluginContext) {
    this.ctx = ctx
  }

  /**
   * Evaluate a single condition
   */
  async evaluateCondition(condition: OutputCondition): Promise<OutputConditionResult> {
    return evaluateCondition(condition, this.ctx)
  }

  /**
   * Evaluate all conditions for an output
   */
  async evaluateOutputConditions(output: PluginOutput): Promise<OutputConditionResult> {
    return evaluateOutputConditions(output, this.ctx)
  }

  /**
   * Check if a file should be blocked
   */
  async checkFileBlocking(file: EmittedFile, output: PluginOutput): Promise<EmittedFile> {
    return checkFileBlocking(file, output, this.ctx)
  }

  /**
   * Filter out blocked files
   */
  filterBlockedFiles(files: EmittedFile[]): EmittedFile[] {
    return filterBlockedFiles(files, this.ctx)
  }

  /**
   * Block empty files
   */
  blockEmptyFiles(files: EmittedFile[]): EmittedFile[] {
    return blockEmptyFiles(files, this.ctx)
  }

  /**
   * Process files through all blocking checks
   * Evaluates conditions and blocks empty files
   *
   * @param files - Files to process
   * @param output - Output configuration with conditions
   * @returns Processed files with blocking applied
   */
  async processFiles(
    files: EmittedFile[],
    output: PluginOutput,
  ): Promise<EmittedFile[]> {
    // First, check output conditions for each file
    const checkedFiles = await Promise.all(
      files.map(async (file) => this.checkFileBlocking(file, output)),
    )

    // Then, block empty files
    const withEmptyBlocked = this.blockEmptyFiles(checkedFiles)

    return withEmptyBlocked
  }
}
