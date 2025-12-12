/**
 * Tests for ConfigLoader
 */

import {beforeEach, describe, expect, it} from 'vitest'
import {ConfigLoader} from './ConfigLoader'
import {defaultPluginConfig} from './defaultConfig'
import type {UserPluginConfig} from './types'

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
    expect(config.paths['cursor']?.outputDir).toBe('.my-rules/')
    expect(config.paths['kiro']).toEqual(defaultPluginConfig.paths?.['kiro'])
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
    expect(configLoader.validate(defaultPluginConfig)).toBe(true)

    // Test with missing inputClassification by creating a partial config
    const invalidConfig: any = { ...defaultPluginConfig }
    invalidConfig.inputClassification = undefined
    expect(configLoader.validate(invalidConfig)).toBe(false)
  })
})