import { describe, expect, it } from 'vitest'
import { generateProjectColor, generateVSCodeColorCustomizations } from './projectColors'

describe('projectColors', () => {
  describe('generateProjectColor', () => {
    it('should return purple color for aindex project', () => {
      const config = generateProjectColor('aindex')

      expect(config.titleBar.activeBackground).toBe('#9333ea')
      expect(config.titleBar.activeForeground).toBe('#ffffff')
      expect(config.borders.editorGroupBorder).toBe('#9333ea')
    })

    it('should generate consistent colors for the same project name', () => {
      const config1 = generateProjectColor('test-project')
      const config2 = generateProjectColor('test-project')

      expect(config1).toEqual(config2)
    })

    it('should generate different colors for different project names', () => {
      const config1 = generateProjectColor('project-a')
      const config2 = generateProjectColor('project-b')

      expect(config1.titleBar.activeBackground).not.toBe(config2.titleBar.activeBackground)
    })

    it('should return valid hex colors', () => {
      const config = generateProjectColor('random-project')
      const hexRegex = /^#[0-9a-f]{6}$/i

      expect(config.titleBar.activeBackground).toMatch(hexRegex)
      expect(config.titleBar.inactiveBackground).toMatch(hexRegex)
      expect(config.borders.editorGroupBorder).toMatch(hexRegex)
    })
  })

  describe('generateVSCodeColorCustomizations', () => {
    it('should generate titleBar-only VSCode color customizations', () => {
      const customizations = generateVSCodeColorCustomizations('test-project')

      expect(customizations).toHaveProperty('titleBar.activeBackground')
      expect(customizations).toHaveProperty('titleBar.activeForeground')
      expect(customizations).toHaveProperty('titleBar.inactiveBackground')
      expect(customizations).toHaveProperty('titleBar.inactiveForeground')
      expect(customizations).toHaveProperty('titleBar.border')
      expect(customizations).not.toHaveProperty('editorGroup.border')
      expect(customizations).not.toHaveProperty('focusBorder')
    })

    it('should apply opacity only to titleBar backgrounds and border', () => {
      const c = generateVSCodeColorCustomizations('test-project')

      expect(c['titleBar.activeBackground']).toMatch(/1a$/)
      expect(c['titleBar.inactiveBackground']).toMatch(/1a$/)
      expect(c['titleBar.border']).toMatch(/1a$/)
      expect(c['titleBar.activeForeground']).not.toMatch(/1a$/)
      expect(c['titleBar.inactiveForeground']).not.toMatch(/1a$/)
    })

    it('should not override editor background color', () => {
      const customizations = generateVSCodeColorCustomizations('test-project')

      expect(customizations).not.toHaveProperty('editor.background')
    })

    it('should generate purple titleBar colors for aindex', () => {
      const customizations = generateVSCodeColorCustomizations('aindex')

      expect(customizations['titleBar.activeBackground']).toBe('#9333ea1a')
      expect(customizations).not.toHaveProperty('editorGroup.border')
    })
  })
})

