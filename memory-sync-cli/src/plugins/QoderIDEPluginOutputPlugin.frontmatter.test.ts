import {beforeEach, describe, expect, it} from 'vitest'
import {QoderIDEPluginOutputPlugin} from './QoderIDEPluginOutputPlugin'

describe('qoderidepluginoutputplugin front matter', () => {
  let plugin: QoderIDEPluginOutputPlugin

  beforeEach(() => {
    plugin = new QoderIDEPluginOutputPlugin()
  })

  describe('buildAlwaysRuleContent', () => {
    it('should include type: user_command in front matter', () => {
      const content = 'Test always rule content'
      const result = (plugin as any).buildAlwaysRuleContent(content)

      expect(result).toContain('type: user_command')
      expect(result).toContain('trigger: always_on')
      expect(result).toContain(content)
    })
  })

  describe('buildGlobRuleContent', () => {
    it('should include type: user_command in front matter', () => {
      const mockChild = {
        content: 'Test glob rule content',
        workingChildDirectoryPath: {path: 'src/utils'}
      }

      const result = (plugin as any).buildGlobRuleContent(mockChild)

      expect(result).toContain('type: user_command')
      expect(result).toContain('trigger: glob')
      expect(result).toContain('glob: src/utils/**')
      expect(result).toContain('Test glob rule content')
    })
  })

  describe('buildFastCommandFrontMatter', () => {
    it('should include type: user_command in fast command front matter', () => {
      const mockCmd = {
        yamlFrontMatter: {
          description: 'Test fast command',
          argumentHint: 'test args',
          allowTools: ['tool1', 'tool2']
        }
      }

      const result = (plugin as any).buildFastCommandFrontMatter(mockCmd)

      expect(result.type).toBe('user_command')
      expect(result.description).toBe('Test fast command')
      expect(result.argumentHint).toBe('test args')
      expect(result.allowTools).toEqual(['tool1', 'tool2'])
    })

    it('should handle fast command without yamlFrontMatter', () => {
      const mockCmd = {}

      const result = (plugin as any).buildFastCommandFrontMatter(mockCmd)

      expect(result.type).toBe('user_command')
      expect(result.description).toBe('Fast command')
    })
  })
})
