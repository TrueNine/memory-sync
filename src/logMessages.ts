/**
 * Standardized log message templates
 * Provides consistent messaging across the application
 */

export const LogMessages = {
  // File operations
  FILE_NOT_FOUND: 'File not found: {}',
  FILE_READ_ERROR: 'Failed to read file {}: {}',
  FILE_WRITE_ERROR: 'Failed to write file {}: {}',
  FILE_COPY_SUCCESS: 'Copied file: {}',
  FILE_COPY_ERROR: 'Failed to copy file {}: {}',
  FILE_DELETE_SUCCESS: 'Deleted file: {}',
  FILE_DELETE_ERROR: 'Failed to delete file {}: {}',

  // Directory operations
  DIR_NOT_FOUND: 'Directory not found: {}',
  DIR_CREATE_SUCCESS: 'Created directory: {}',
  DIR_CREATE_ERROR: 'Failed to create directory {}: {}',
  DIR_CLEAN_SUCCESS: 'Cleaned directory: {}',
  DIR_CLEAN_ERROR: 'Failed to clean directory {}: {}',
  DIR_SYNC_SUCCESS: 'Synced directory from {} to {}',
  DIR_SYNC_ERROR: 'Failed to sync directory from {} to {}: {}',

  // Export operations
  EXPORT_START: 'Starting export operation...',
  EXPORT_SUCCESS: 'Export completed: {} file(s) exported',
  EXPORT_ERROR: 'Export failed: {}',
  EXPORT_SKIPPED: 'Export skipped: {}',

  // Sync operations
  SYNC_START: 'Starting sync operation...',
  SYNC_SUCCESS: 'Sync completed: {} file(s) synced',
  SYNC_ERROR: 'Sync failed: {}',
  SYMLINK_CREATE_SUCCESS: 'Created symlink: {} -> {}',
  SYMLINK_CREATE_ERROR: 'Failed to create symlink {} -> {}: {}',

  // Rule generation
  RULE_GENERATE_START: 'Generating rule file: {}',
  RULE_GENERATE_SUCCESS: 'Generated rule file: {}',
  RULE_GENERATE_ERROR: 'Failed to generate rule file {}: {}',

  // Command execution
  COMMAND_START: 'Executing command: {}',
  COMMAND_SUCCESS: 'Command completed successfully',
  COMMAND_ERROR: 'Command failed: {}',

  // Configuration
  CONFIG_LOAD_SUCCESS: 'Loaded configuration from {}',
  CONFIG_LOAD_ERROR: 'Failed to load configuration: {}',
  CONFIG_SAVE_SUCCESS: 'Saved configuration to {}',
  CONFIG_SAVE_ERROR: 'Failed to save configuration: {}',

  // Validation
  VALIDATION_ERROR: 'Validation failed: {}',
  VALIDATION_SUCCESS: 'Validation passed',

  // General
  OPERATION_SKIPPED: 'Operation skipped: {}',
  OPERATION_COMPLETE: 'Operation completed',
  UNEXPECTED_ERROR: 'Unexpected error: {}',
} as const

/**
 * Log level guidelines:
 * - error: Failures that prevent operation completion, require user attention
 * - warn: Issues that don't prevent completion but may need attention
 * - info: Normal operation progress, user-facing status updates
 * - debug: Detailed diagnostic information for troubleshooting
 */
export const LogLevelGuidelines = {
  ERROR: [
    'File system errors (read/write failures)',
    'Configuration errors',
    'Command execution failures',
    'Validation failures',
    'Unexpected exceptions',
  ],
  WARN: [
    'Missing optional files or directories',
    'Skipped operations due to preconditions',
    'Deprecated feature usage',
    'Non-critical failures',
  ],
  INFO: [
    'Operation start/completion',
    'Successful file operations',
    'Progress updates',
    'Summary statistics',
  ],
  DEBUG: [
    'Detailed operation steps',
    'Internal state changes',
    'Diagnostic information',
    'Ignored files/directories',
  ],
} as const
