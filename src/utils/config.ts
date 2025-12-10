import type { TrueNineConfig } from '../types'
import fs from 'fs-extra'
import pc from 'picocolors'
import { CONFIG_FILE_NAME, DEFAULT_CONFIG } from '../constants'
import { PathBuilder } from '../constants/paths'

export async function getConfigPath(): Promise<string> {
  const aindexPaths = PathBuilder.forProject('aindex')
  return aindexPaths.resolve(CONFIG_FILE_NAME)
}

export async function loadConfig(): Promise<TrueNineConfig> {
  const configPath = await getConfigPath()

  try {
    if (await fs.pathExists(configPath)) {
      const configData = await fs.readJson(configPath) as TrueNineConfig
      return { ...DEFAULT_CONFIG, ...configData }
    }
  } catch (error: unknown) {
    console.warn(pc.yellow('⚠ Failed to load config, using defaults'), error)
  }

  return DEFAULT_CONFIG
}

export async function saveConfig(config: TrueNineConfig): Promise<void> {
  const configPath = await getConfigPath()
  await fs.writeJson(configPath, config, { spaces: 2 })
}
