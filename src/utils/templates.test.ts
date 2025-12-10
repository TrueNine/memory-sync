import { describe, expect, it } from 'vitest'
import {
  generateBasicTemplate,
  generateEditorConfig,
  generateGitIgnore,
  generateProjectFile,
  generateProjectTemplate,
  generateReadme,
} from './templates'

describe('Template Generators', () => {
  describe('generateEditorConfig', () => {
    it('should generate valid editorconfig', () => {
      const config = generateEditorConfig()
      expect(config).toContain('root = true')
      expect(config).toContain('charset = utf-8')
      expect(config).toContain('indent_size = 2')
    })
  })

  describe('generateGitIgnore', () => {
    it('should include common ignore patterns', () => {
      const gitignore = generateGitIgnore()
      expect(gitignore).toContain('node_modules/')
      expect(gitignore).toContain('dist/')
      expect(gitignore).toContain('.DS_Store')
    })
  })

  describe('generateReadme', () => {
    it('should include project name', () => {
      const readme = generateReadme({ projectName: 'Test Project' })
      expect(readme).toContain('# Test Project')
    })

    it('should include description if provided', () => {
      const readme = generateReadme({ description: 'Test Description' })
      expect(readme).toContain('Test Description')
    })
  })

  describe('generateBasicTemplate', () => {
    it('should include frontmatter', () => {
      const template = generateBasicTemplate()
      expect(template).toContain('---')
      expect(template).toContain('created: {{date}}')
      expect(template).toContain('tags: []')
    })
  })

  describe('generateProjectTemplate', () => {
    it('should include project sections', () => {
      const template = generateProjectTemplate()
      expect(template).toContain('## Project Overview')
      expect(template).toContain('## Goals')
      expect(template).toContain('## Progress')
    })
  })

  describe('generateProjectFile', () => {
    it('should include project name', () => {
      const file = generateProjectFile('TestProject')
      expect(file).toContain('# TestProject')
      expect(file).toContain('_airef/TestProject/')
    })

    it('should include current date', () => {
      const file = generateProjectFile('TestProject')
      const today = new Date().toISOString().split('T')[0]
      expect(file).toContain(today)
    })
  })
})

