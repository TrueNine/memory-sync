/**
 * Cross-platform path normalization utility.
 *
 * Wraps `node:path`'s `normalize` to handle paths with mixed separators
 * (forward slashes `/` and backslashes `\`), producing a valid path
 * for the current platform.
 *
 * On POSIX systems, backslash is technically a valid filename character,
 * but when dealing with cross-platform paths (e.g., paths from Windows),
 * backslashes should be treated as separators. This function first
 * converts all backslashes to forward slashes, then applies
 * `path.normalize()` to produce a platform-valid result.
 *
 * @module pathNormalize
 */
import path from 'node:path'

/**
 * Normalize a file path that may contain mixed separators.
 *
 * 1. Returns `'.'` for empty or whitespace-only input (consistent with `path.normalize('')`).
 * 2. Replaces all backslashes with forward slashes to unify separators.
 * 3. Applies `path.normalize()` for platform-aware normalization
 *    (resolving `.`, `..`, and duplicate separators).
 *
 * @param inputPath - A file path string, potentially with mixed `/` and `\` separators.
 * @returns The normalized path using the current platform's separator conventions.
 */
export function normalizePath(inputPath: string): string {
  if (inputPath.trim() === '') {
    return '.'
  }
  // Unify separators: replace all backslashes with forward slashes first,
  // then let path.normalize handle the rest (it will convert to platform sep).
  const unified = inputPath.replace(/\\/g, '/')
  return path.normalize(unified)
}

/**
 * The platform-specific path separator.
 * Re-exported for convenience in tests and consumers.
 */
export const platformSep: string = path.sep
