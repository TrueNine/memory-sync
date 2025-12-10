/**
 * Tests for ClassificationService
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ClassificationService } from './ClassificationService'
import { defaultPluginConfig } from '../config/defaultConfig'
import type { InputBundle, InputType } from '../types'

describe('ClassificationService', () => {
  let service: ClassificationService

  beforeEach(() => {
    service = new ClassificationService(defaultPluginConfig)
  })

  describe('classifyBundle', () => {
    it('should classify AGENTS.md as MEMORY_PROMPT', () => {
      const bundle: InputBundle = {
        type: InputType.CONFIG_FILE,
        path: 'AGENTS.md',
        content: '# AGENTS',
      }

      const classified = service.classifyBundle(bundle)
      expect(classified.type).toBe(InputType.MEMORY_PROMPT)
    })

    it('should classify GLOBAL.md as GLOBAL_PROMPT', () => {
      const bundle: InputBundle = {
        type: InputType.CONFIG_FILE,
        path: 'GLOBAL.md',
        content: '# Global',
      }

      const classified = service.classifyBundle(bundle)
      expect(classified.type).toBe(InputType.GLOBAL_PROMPT)
    })

    it('should classify files in commands/ as FAST_COMMAND', () => {
      const bundle: InputBundle = {
        type: InputType.CONFIG_FILE,
        path: 'commands/test.md',
        content: '# Test',
      }

      const classified = service.classifyBundle(bundle)
      expect(classified.type).toBe(InputType.FAST_COMMAND)
    })

    it('should classify files in agents/ as SUB_AGENT', () => {
      const bundle: InputBundle = {
        type: InputType.CONFIG_FILE,
        path: 'agents/test.md',
        content: '# Agent',
      }

      const classified = service.classifyBundle(bundle)
      expect(classified.type).toBe(InputType.SUB_AGENT)
    })

    it('should classify files in skills/ as SKILL', () => {
      const bundle: InputBundle = {
        type: InputType.CONFIG_FILE,
        path: 'skills/test.md',
        content: '# Skill',
      }

      const classified = service.classifyBundle(bundle)
      expect(classified.type).toBe(InputType.SKILL)
    })

    it('should use default type for unmatched files', () => {
      const bundle: InputBundle = {
        type: InputType.CONFIG_FILE,
        path: 'unknown.txt',
        content: 'Unknown',
      }

      const classified = service.classifyBundle(bundle)
      expect(classified.type).toBe(InputType.CONFIG_FILE)
    })

    it('should preserve existing type if already classified', () => {
      const bundle: InputBundle = {
        type: InputType.SUB_AGENT,
        path: 'test.md',
        content: '# Test',
      }

      const classified = service.classifyBundle(bundle)
      expect(classified.type).toBe(InputType.SUB_AGENT)
    })
  })

  describe('classifyBundles', () => {
    it('should classify multiple bundles', () => {
      const bundles: InputBundle[] = [
        {
          type: InputType.CONFIG_FILE,
          path: 'AGENTS.md',
          content: '# Agents',
        },
        {
          type: InputType.CONFIG_FILE,
          path: 'commands/test.md',
          content: '# Test',
        },
      ]

      const classified = service.classifyBundles(bundles)
      expect(classified).toHaveLength(2)
      expect(classified[0].type).toBe(InputType.MEMORY_PROMPT)
      expect(classified[1].type).toBe(InputType.FAST_COMMAND)
    })
  })

  describe('getFrontMatter', () => {
    it('should return existing front matter if present', () => {
      const frontMatter = { type: 'memory-prompt' }
      const bundle: InputBundle = {
        type: InputType.MEMORY_PROMPT,
        path: 'test.md',
        content: '# Test',
        frontMatter,
      }

      const result = service.getFrontMatter(InputType.MEMORY_PROMPT, bundle)
      expect(result).toEqual(frontMatter)
    })

    it('should generate front matter for SUB_AGENT type', () => {
      const bundle: InputBundle = {
        type: InputType.SUB_AGENT,
        path: 'agents/TestAgent.md',
        content: '# Test Agent',
      }

      const result = service.getFrontMatter(InputType.SUB_AGENT, bundle)
      expect(result?.type).toBe('sub-agent')
      expect(result?.name).toBe('TestAgent')
    })

    it('should generate front matter for FAST_COMMAND type', () => {
      const bundle: InputBundle = {
        type: InputType.FAST_COMMAND,
        path: 'commands/testCommand.md',
        content: '# Test Command',
      }

      const result = service.getFrontMatter(InputType.FAST_COMMAND, bundle)
      expect(result?.type).toBe('fast-command')
      expect(result?.command).toBe('testCommand')
    })

    it('should generate front matter for SKILL type', () => {
      const bundle: InputBundle = {
        type: InputType.SKILL,
        path: 'skills/testSkill/SKILL.md',
        content: '# Test Skill',
      }

      const result = service.getFrontMatter(InputType.SKILL, bundle)
      expect(result?.type).toBe('skill')
      expect(result?.skill).toBe('testSkill')
    })

    it('should include source project if present', () => {
      const bundle: InputBundle = {
        type: InputType.MEMORY_PROMPT,
        path: 'AGENTS.md',
        content: '# Agents',
        sourceProject: 'test-project',
      }

      const result = service.getFrontMatter(InputType.MEMORY_PROMPT, bundle)
      expect(result?.source).toBe('test-project')
    })
  })

  describe('matchesType', () => {
    it('should check if path matches a type', () => {
      expect(service.matchesType('AGENTS.md', InputType.MEMORY_PROMPT)).toBe(true)
      expect(service.matchesType('commands/test.md', InputType.FAST_COMMAND)).toBe(true)
      expect(service.matchesType('test.txt', InputType.MEMORY_PROMPT)).toBe(false)
    })
  })

  describe('getExcludePatterns', () => {
    it('should return exclude patterns', () => {
      const patterns = service.getExcludePatterns()
      expect(Array.isArray(patterns)).toBe(true)
    })
  })
})