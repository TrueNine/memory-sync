/**
 * Tests for ConfigLoader
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ConfigLoader } from './ConfigLoader'
import { defaultPluginConfig } from './defaultConfig'
import type { UserPluginConfig } from './types'

describe('ConfigLoader', () => {
  let configLoader: ConfigLoader

  beforeEach(() => {
    configLoader = new ConfigLoader()
  })

  it('should load default configuration', async () => {
    const config = await configLoader.load()
    expect(config).toEqual(defaultPluginConfig)
  })

  it('should merge user configuration with defaults', async () => {
    const userConfig: UserPluginConfig = {
      paths: {
        cursor: {
          outputDir: '.my-rules/',
        },
      },
    }

    const config = await configLoader.load(userConfig)
    expect(config.paths.cursor.outputDir).toBe('.my-rules/')
    expect(config.paths.kiro).toEqual(defaultPluginConfig.paths.kiro)
  })

  it('should clear cache', async () => {
    // Load once
    await configLoader.load()

    // Clear cache
    configLoader.clearCache()

    // Should not throw
    await configLoader.load()
  })

  it('should validate configuration', () => {
    const validConfig = defaultPluginConfig
    expect(configLoader.validate(validConfig)).toBe(true)

    const invalidConfig = { ...defaultPluginConfig }
    delete invalidConfig.inputClassification
    expect(configLoader.validate(invalidConfig as any)).toBe(false)
  })
})