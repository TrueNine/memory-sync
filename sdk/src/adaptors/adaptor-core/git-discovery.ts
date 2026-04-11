import {getNativeBinding} from '@/core/native-binding'

interface GitDiscoveryFns {
  readonly resolveGitInfoDir: (projectDir: string) => string | undefined
  readonly findAllGitRepos: (rootDir: string, maxDepth?: number) => string[]
  readonly findGitModuleInfoDirs: (dotGitDir: string) => string[]
}

let gitDiscoveryFnsCache: GitDiscoveryFns | undefined

function getGitDiscoveryFns(): GitDiscoveryFns {
  if (gitDiscoveryFnsCache != null) return gitDiscoveryFnsCache

  const candidate = getNativeBinding<GitDiscoveryFns>()
  if (candidate == null) {
    throw new TypeError('Native git-discovery binding is required. Build or install the Rust NAPI package before running tnmsc.')
  }
  if (
    typeof candidate.resolveGitInfoDir !== 'function'
    || typeof candidate.findAllGitRepos !== 'function'
    || typeof candidate.findGitModuleInfoDirs !== 'function'
  ) {
    throw new TypeError('Native git-discovery binding is incomplete. Rebuild the Rust NAPI package before running tnmsc.')
  }
  gitDiscoveryFnsCache = candidate
  return candidate
}

export function resolveGitInfoDir(projectDir: string): string | undefined {
  return getGitDiscoveryFns().resolveGitInfoDir(projectDir)
}

export function findAllGitRepos(rootDir: string, maxDepth?: number): string[] {
  return getGitDiscoveryFns().findAllGitRepos(rootDir, maxDepth)
}

export function findGitModuleInfoDirs(dotGitDir: string): string[] {
  return getGitDiscoveryFns().findGitModuleInfoDirs(dotGitDir)
}
