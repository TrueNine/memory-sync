import { describe, expect, it } from 'vitest'
import { CONFIG_FILE_NAME, DEFAULT_CONFIG, DIRECTORY_STRUCTURE } from './index'

describe('Constants', () => {
  describe('DEFAULT_CONFIG', () => {
    it('should have correct structure', () => {
      expect(DEFAULT_CONFIG).toHaveProperty('projectName')
      expect(DEFAULT_CONFIG).toHaveProperty('author')
      expect(DEFAULT_CONFIG).toHaveProperty('description')
      expect(DEFAULT_CONFIG).toHaveProperty('version')
      expect(DEFAULT_CONFIG).toHaveProperty('promptSettings')
      expect(DEFAULT_CONFIG).toHaveProperty('projectSettings')
    })

    it('should have correct default values', () => {
      expect(DEFAULT_CONFIG.projectName).toBe('aindex')
      expect(DEFAULT_CONFIG.promptSettings.outputFormat).toBe('markdown')
      expect(DEFAULT_CONFIG.projectSettings.validateStructure).toBe(true)
    })
  })

  describe('DIRECTORY_STRUCTURE', () => {
    it('should include essential directories', () => {
      expect(DIRECTORY_STRUCTURE).toContain('_ai/src')
      expect(DIRECTORY_STRUCTURE).toContain('ref')
      expect(DIRECTORY_STRUCTURE).toContain('projects')
    })
  })

  describe('CONFIG_FILE_NAME', () => {
    it('should be correct config file name', () => {
      expect(CONFIG_FILE_NAME).toBe('.truenine.json')
    })
  })
})

