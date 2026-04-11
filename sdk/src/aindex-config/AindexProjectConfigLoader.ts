import type {AindexProjectConfig, AindexProjectConfigLoadResult} from './AindexProjectConfig'
import type {ILogger} from '@/libraries/logger'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {createLogger} from '@/libraries/logger'

const CONFIG_FILE_NAMES = ['aindex.config.ts', 'aindex.config.mts', 'aindex.config.cts', 'aindex.config.js', 'aindex.config.mjs', 'aindex.config.cjs']

const DEFAULT_CONFIG: AindexProjectConfig = {
  emptyDirCleanup: {
    exclude: []
  }
}

export class AindexProjectConfigLoader {
  private readonly logger: ILogger

  constructor() {
    this.logger = createLogger('AindexProjectConfigLoader')
  }

  async loadFromDirectory(dirPath: string): Promise<AindexProjectConfigLoadResult> {
    for (const configName of CONFIG_FILE_NAMES) {
      const configPath = path.join(dirPath, configName)
      if (fs.existsSync(configPath)) {
        return this.loadFromFile(configPath)
      }
    }
    return {config: DEFAULT_CONFIG, source: null, found: false}
  }

  async loadFromFile(filePath: string): Promise<AindexProjectConfigLoadResult> {
    try {
      const resolvedPath = path.resolve(filePath)

      if (!fs.existsSync(resolvedPath)) {
        return {config: DEFAULT_CONFIG, source: null, found: false}
      }

      const mod = (await import(resolvedPath)) as Record<string, unknown>
      const rawConfig = mod != null && typeof mod === 'object' ? 'default' in mod ? mod['default'] : 'config' in mod ? mod['config'] : mod : mod

      const config = this.normalizeConfig(rawConfig)
      this.logger.debug('aindex project config loaded', {source: resolvedPath})
      return {config, source: resolvedPath, found: true}
    } catch (error) {
      this.logger.warn({
        code: 'AINDEX_CONFIG_LOAD_FAILED',
        title: 'aindex project config load failed',
        rootCause: [error instanceof Error ? error.message : String(error)],
        details: {path: filePath}
      })
      return {config: DEFAULT_CONFIG, source: null, found: false}
    }
  }

  private normalizeConfig(raw: unknown): AindexProjectConfig {
    if (raw == null || typeof raw !== 'object') return DEFAULT_CONFIG
    const obj = raw as Record<string, unknown>

    const edc = obj['emptyDirCleanup']
    if (edc != null && typeof edc !== 'object') return {}

    const edcObj = edc as Record<string, unknown>
    return {
      emptyDirCleanup: {
        exclude: toStringArray(edcObj['exclude'])
      }
    }
  }
}

function toStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.filter((x): x is string => typeof x === 'string')
  if (typeof val === 'string') return [val]
  return []
}

let defaultLoader: AindexProjectConfigLoader | null = null

export function getAindexProjectConfigLoader(): AindexProjectConfigLoader {
  defaultLoader ??= new AindexProjectConfigLoader()
  return defaultLoader
}

export async function loadAindexProjectConfig(dirPath: string): Promise<AindexProjectConfigLoadResult> {
  return getAindexProjectConfigLoader().loadFromDirectory(dirPath)
}
