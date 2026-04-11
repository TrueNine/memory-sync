import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Resolves the actual `.git/info` directory for a given project path.
 * Handles both regular git repos (`.git` is a directory) and submodules/worktrees (`.git` is a file with `gitdir:` pointer).
 * Returns `null` if no valid git info directory can be resolved.
 */
export function resolveGitInfoDir(projectDir: string): string | null {
  const dotGitPath = path.join(projectDir, '.git')

  if (!fs.existsSync(dotGitPath)) return null

  const stat = fs.lstatSync(dotGitPath)

  if (stat.isDirectory()) {
    return path.join(dotGitPath, 'info')
  }

  if (stat.isFile()) {
    try {
      const content = fs.readFileSync(dotGitPath, 'utf8').trim()
      const match = /^gitdir: (.+)$/.exec(content)
      if (match?.[1] != null) {
        const gitdir = path.resolve(projectDir, match[1])
        return path.join(gitdir, 'info')
      }
    } catch {} // ignore read errors
  }

  return null
}

/**
 * Recursively discovers all `.git` entries (directories or files) under a given root,
 * skipping common non-source directories.
 * Returns absolute paths of directories containing a `.git` entry.
 */
export function findAllGitRepos(rootDir: string, maxDepth = 5): string[] {
  const results: string[] = []
  const SKIP_DIRS = new Set(['node_modules', '.turbo', 'dist', 'build', 'out', '.cache'])

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return

    let entries: fs.Dirent[]
    try {
      const raw = fs.readdirSync(dir, {withFileTypes: true})
      if (!Array.isArray(raw)) return
      entries = raw
    } catch {
      return
    }

    const hasGit = entries.some(e => e.name === '.git')
    if (hasGit && dir !== rootDir) results.push(dir)

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name === '.git' || SKIP_DIRS.has(entry.name)) continue
      walk(path.join(dir, entry.name), depth + 1)
    }
  }

  walk(rootDir, 0)
  return results
}

/**
 * Scans `.git/modules/` directory recursively to find all submodule `info/` dirs.
 * Handles nested submodules (modules within modules).
 * Returns absolute paths of `info/` directories.
 */
export function findGitModuleInfoDirs(dotGitDir: string): string[] {
  const modulesDir = path.join(dotGitDir, 'modules')
  if (!fs.existsSync(modulesDir)) return []

  const results: string[] = []

  function walk(dir: string): void {
    let entries: fs.Dirent[]
    try {
      const raw = fs.readdirSync(dir, {withFileTypes: true})
      if (!Array.isArray(raw)) return
      entries = raw
    } catch {
      return
    }

    const hasInfo = entries.some(e => e.name === 'info' && e.isDirectory())
    if (hasInfo) results.push(path.join(dir, 'info'))

    const nestedModules = entries.find(e => e.name === 'modules' && e.isDirectory())
    if (nestedModules == null) return

    let subEntries: fs.Dirent[]
    try {
      const raw = fs.readdirSync(path.join(dir, 'modules'), {withFileTypes: true})
      if (!Array.isArray(raw)) return
      subEntries = raw
    } catch {
      return
    }
    for (const sub of subEntries) {
      if (sub.isDirectory()) walk(path.join(dir, 'modules', sub.name))
    }
  }

  let topEntries: fs.Dirent[]
  try {
    const raw = fs.readdirSync(modulesDir, {withFileTypes: true})
    if (!Array.isArray(raw)) return results
    topEntries = raw
  } catch {
    return results
  }

  for (const entry of topEntries) {
    if (entry.isDirectory()) walk(path.join(modulesDir, entry.name))
  }

  return results
}
