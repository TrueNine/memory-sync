import type {ILogger, OutputRuntimeTargets} from '@/adaptors/adaptor-core'

import type {NativeDeskPathsBinding} from '@/core/desk-paths-types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {getNativeBinding} from '@/core/native-binding'
import {buildFileOperationDiagnostic} from '@/diagnostics'

function getPlatformFixedDir(): string {
  const binding = getNativeBinding<NativeDeskPathsBinding>()
  if (binding?.getPlatformFixedDir == null) {
    throw new Error('Native desk-paths binding is required. Build or install the Rust NAPI package before running tnmsc.')
  }
  return binding.getPlatformFixedDir()
}

const JETBRAINS_VENDOR_DIR = 'JetBrains'
const JETBRAINS_AIA_DIR = 'aia'
const JETBRAINS_CODEX_DIR = 'codex'
const SUPPORTED_JETBRAINS_IDE_DIR_PREFIXES = [
  'IntelliJIdea',
  'WebStorm',
  'RustRover',
  'PyCharm',
  'PyCharmCE',
  'PhpStorm',
  'GoLand',
  'CLion',
  'DataGrip',
  'RubyMine',
  'Rider',
  'DataSpell',
  'Aqua'
] as const

function isSupportedJetBrainsIdeDir(dirName: string): boolean {
  return SUPPORTED_JETBRAINS_IDE_DIR_PREFIXES.some(prefix => dirName.startsWith(prefix))
}

function discoverJetBrainsCodexDirs(logger: ILogger): readonly string[] {
  const baseDir = path.join(getPlatformFixedDir(), JETBRAINS_VENDOR_DIR)

  try {
    const dirents = fs.readdirSync(baseDir, {withFileTypes: true})
    return dirents
      .filter(dirent => dirent.isDirectory() && isSupportedJetBrainsIdeDir(dirent.name))
      .map(dirent => path.join(baseDir, dirent.name, JETBRAINS_AIA_DIR, JETBRAINS_CODEX_DIR))
  }
  catch (error) {
    logger.debug(buildFileOperationDiagnostic({
      code: 'JETBRAINS_CODEX_DIRECTORY_SCAN_SKIPPED',
      title: 'JetBrains Codex directories are unavailable',
      operation: 'scan',
      targetKind: 'JetBrains IDE directory',
      path: baseDir,
      error
    }))
    return []
  }
}

export function discoverOutputRuntimeTargets(logger: ILogger): OutputRuntimeTargets {
  return {
    jetbrainsCodexDirs: discoverJetBrainsCodexDirs(logger)
  }
}
