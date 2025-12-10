/**
 * Dry-run tracker implementation
 * Tracks simulated file operations during dry-run mode
 *
 * @see Requirements 21.1, 21.2, 21.3, 21.4
 */

import type {
  DryRunOperation,
  DryRunOperationType,
  DryRunStats,
  DryRunTracker,
} from './types'

/**
 * Create a new dry-run tracker instance
 * Tracks all file operations that would be performed during dry-run mode
 *
 * @returns DryRunTracker instance
 * @see Requirements 21.1, 21.2, 21.3
 */
export function createDryRunTracker(): DryRunTracker {
  const operations: DryRunOperation[] = []
  const errors: string[] = []

  return {
    /**
     * Record a file operation
     * @param operation - Operation to record
     * @see Requirement 21.2
     */
    record(operation: DryRunOperation): void {
      operations.push(operation)
    },

    /**
     * Get current statistics
     * @returns Current dry-run statistics with counts
     * @see Requirement 21.3
     */
    getStats(): DryRunStats {
      let filesToCreate = 0
      let filesToModify = 0
      let filesToDelete = 0
      let directoriesToCreate = 0
      let directoriesToClean = 0
      let copyOperations = 0

      for (const op of operations) {
        switch (op.type) {
          case 'create':
            filesToCreate++
            break
          case 'modify':
            filesToModify++
            break
          case 'delete':
            filesToDelete++
            break
          case 'copy':
            copyOperations++
            break
          case 'symlink':
          case 'ensureSymlink':
            // Count these as creates for now, or add specific counters
            filesToCreate++
            break
          case 'ensureDir':
            directoriesToCreate++
            break
          case 'cleanDir':
            directoriesToClean++
            break
        }
      }

      return {
        filesToCreate,
        filesToModify,
        filesToDelete,
        directoriesToCreate,
        directoriesToClean,
        copyOperations,
        operations: [...operations],
      }
    },

    /**
     * Reset all tracked operations
     */
    reset(): void {
      operations.length = 0
      errors.length = 0
    },

    /**
     * Check if any errors occurred during simulation
     * @returns True if no errors occurred
     * @see Requirement 21.4
     */
    isSuccess(): boolean {
      return errors.length === 0
    },

    /**
     * Record an error during simulation
     * @param error - Error message
     */
    recordError(error: string): void {
      errors.push(error)
    },

    /**
     * Get all recorded errors
     * @returns Array of error messages
     */
    getErrors(): string[] {
      return [...errors]
    },
  }
}

/**
 * Helper function to create a dry-run operation record
 *
 * @param type - Operation type
 * @param path - Target path
 * @param sourcePath - Source path (for copy operations)
 * @returns DryRunOperation record
 */
export function createDryRunOperation(
  type: DryRunOperationType,
  path: string,
  sourcePath?: string,
): DryRunOperation {
  const operation: DryRunOperation = {
    type,
    path,
    timestamp: Date.now(),
  }
  if (sourcePath != null) {
    operation.sourcePath = sourcePath
  }
  return operation
}
