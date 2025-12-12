import os from 'node:os'
import path from 'node:path'

/**
 * Path variable resolver
 * Supports variable substitution in paths like $USER_HOME, $HOME, etc.
 */

// Get user home directory (normalized for Windows)
const USER_HOME = process.platform === 'win32'
  ? os.homedir().replace(/\\/g, '/')
  : os.homedir()

// Available variables mapping
const VARIABLES: Record<string, string> = {
  USER_HOME,
  HOME: USER_HOME,
  // Could add more variables in the future
}

/**
 * Resolve variables in a path string
 * 
 * @param pathStr - Path string that may contain variables like $USER_HOME
 * @returns Resolved path with variables substituted
 * 
 * @example
 * ```typescript
 * const resolved = resolvePathVariables('$USER_HOME/.codex/AGENTS.md')
 * // Returns: '/home/user/.codex/AGENTS.md' (on Linux/Mac)
 * // Returns: 'C:/Users/Username/.codex/AGENTS.md' (on Windows)
 * ```
 */
export function resolvePathVariables(pathStr: string): string {
  let resolved = pathStr
  
  // Replace all known variables
  for (const [variable, value] of Object.entries(VARIABLES)) {
    // Replace both $VAR and ${VAR} formats
    resolved = resolved.replace(new RegExp(`\\$\\{${variable}\\}`, 'g'), value)
    resolved = resolved.replace(new RegExp(`\\$${variable}`, 'g'), value)
  }
  
  // Normalize path separators
  return resolved.replace(/\\/g, '/')
}

/**
 * Check if a path contains unresolved variables
 * 
 * @param pathStr - Path string to check
 * @returns True if path contains unresolved variables
 */
export function hasUnresolvedVariables(pathStr: string): boolean {
  const variablePattern = /\$(?:\{[A-Za-z_][A-Za-z0-9_]*\}|[A-Za-z_][A-Za-z0-9_]*)/
  return variablePattern.test(pathStr)
}

/**
 * Get list of available variables
 * 
 * @returns Array of available variable names
 */
export function getAvailableVariables(): string[] {
  return Object.keys(VARIABLES)
}