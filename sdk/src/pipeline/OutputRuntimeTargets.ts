import type {ILogger, OutputRuntimeTargets} from '@/adaptors/adaptor-core'
import {getNativeBinding} from '@/core/native-binding'
import {buildFileOperationDiagnostic} from '@/diagnostics'

interface NativeOutputRuntimeTargetsBinding {
  discoverOutputRuntimeTargets?: () => string[]
}

export function discoverOutputRuntimeTargets(logger: ILogger): OutputRuntimeTargets {
  const binding = getNativeBinding<NativeOutputRuntimeTargetsBinding>()
  if (binding?.discoverOutputRuntimeTargets != null) {
    try {
      const dirs = binding.discoverOutputRuntimeTargets()
      return {jetbrainsCodexDirs: dirs}
    } catch (error) {
      logger.debug(
        buildFileOperationDiagnostic({
          code: 'JETBRAINS_CODEX_DIRECTORY_SCAN_SKIPPED',
          title: 'JetBrains Codex directories are unavailable',
          operation: 'scan',
          targetKind: 'JetBrains IDE directory',
          path: '',
          error
        })
      )
      return {jetbrainsCodexDirs: []}
    }
  }

  return {jetbrainsCodexDirs: []}
}
