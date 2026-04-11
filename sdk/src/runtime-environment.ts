import type {
  RuntimeEnvironmentContext,
  RuntimeEnvironmentDependencies
} from './internal/runtime-environment-legacy'
import {getNativeBinding} from './core/native-binding'

import {
  getEffectiveHomeDir as legacyGetEffectiveHomeDir,
  getGlobalConfigPath as legacyGetGlobalConfigPath,
  getRequiredGlobalConfigPath as legacyGetRequiredGlobalConfigPath,
  isWslRuntime as legacyIsWslRuntime,
  resolveRuntimeEnvironment as legacyResolveRuntimeEnvironment
} from './internal/runtime-environment-legacy'

export type {
  RuntimeEnvironmentContext,
  RuntimeEnvironmentDependencies
} from './internal/runtime-environment-legacy'

export {
  DEFAULT_GLOBAL_CONFIG_DIR,
  DEFAULT_GLOBAL_CONFIG_FILE_NAME,
  DEFAULT_WSL_WINDOWS_USERS_ROOT,
  findWslHostGlobalConfigPaths,
  resolveUserPath
} from './internal/runtime-environment-legacy'

interface RuntimeEnvFns {
  readonly resolveRuntimeEnvironment: () => string
  readonly getEffectiveHomeDir: () => string
  readonly getGlobalConfigPath: () => string
  readonly getRequiredGlobalConfigPath: () => string
  readonly isWslRuntime: () => boolean
}

let runtimeEnvFnsCache: RuntimeEnvFns | undefined

function getRuntimeEnvFns(): RuntimeEnvFns {
  if (runtimeEnvFnsCache != null) return runtimeEnvFnsCache

  const candidate = getNativeBinding<RuntimeEnvFns>()
  if (candidate == null) {
    runtimeEnvFnsCache = {
      resolveRuntimeEnvironment: () => JSON.stringify(legacyResolveRuntimeEnvironment()),
      getEffectiveHomeDir: legacyGetEffectiveHomeDir,
      getGlobalConfigPath: legacyGetGlobalConfigPath,
      getRequiredGlobalConfigPath: legacyGetRequiredGlobalConfigPath,
      isWslRuntime: legacyIsWslRuntime
    }
    return runtimeEnvFnsCache
  }
  if (
    typeof candidate.resolveRuntimeEnvironment !== 'function'
    || typeof candidate.getEffectiveHomeDir !== 'function'
    || typeof candidate.getGlobalConfigPath !== 'function'
    || typeof candidate.getRequiredGlobalConfigPath !== 'function'
    || typeof candidate.isWslRuntime !== 'function'
  ) {
    throw new TypeError('Native runtime-environment binding is incomplete. Rebuild the Rust NAPI package before running tnmsc.')
  }
  runtimeEnvFnsCache = candidate
  return candidate
}

export function resolveRuntimeEnvironment(dependencies?: RuntimeEnvironmentDependencies): RuntimeEnvironmentContext {
  if (dependencies != null) {
    return legacyResolveRuntimeEnvironment(dependencies)
  }
  return JSON.parse(getRuntimeEnvFns().resolveRuntimeEnvironment()) as RuntimeEnvironmentContext
}

export function getEffectiveHomeDir(dependencies?: RuntimeEnvironmentDependencies): string {
  if (dependencies != null) {
    return legacyGetEffectiveHomeDir(dependencies)
  }
  return getRuntimeEnvFns().getEffectiveHomeDir()
}

export function getGlobalConfigPath(dependencies?: RuntimeEnvironmentDependencies): string {
  if (dependencies != null) {
    return legacyGetGlobalConfigPath(dependencies)
  }
  return getRuntimeEnvFns().getGlobalConfigPath()
}

export function getRequiredGlobalConfigPath(dependencies?: RuntimeEnvironmentDependencies): string {
  if (dependencies != null) {
    return legacyGetRequiredGlobalConfigPath(dependencies)
  }
  return getRuntimeEnvFns().getRequiredGlobalConfigPath()
}

export function isWslRuntime(dependencies?: RuntimeEnvironmentDependencies): boolean {
  if (dependencies != null) {
    return legacyIsWslRuntime(dependencies)
  }
  return getRuntimeEnvFns().isWslRuntime()
}
