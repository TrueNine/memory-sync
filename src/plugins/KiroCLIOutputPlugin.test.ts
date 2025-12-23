import type { FastCommandPrompt, SkillYAMLFrontMatter } from '@/types'
import type { RelativePath } from '@/types/FileSystemTypes'
import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { FilePathKind, PromptKind } from '@/types'
import { KiroCLIOutputPlugin } from './KiroCLIOutputPlugin'

function createMockRelativePath(pathStr: string, basePath: string): RelativePath {
  return {
    pathKind: FilePathKind.Relative,
    path: pathStr,
    basePath,
    getDirectoryName: () => pathStr,
    getAbsolutePath: () => `${basePath}/${pathStr}`,
  }
}

function createMockFastCommandPrompt(
  series: string | undefined,
  commandName: string,
): FastCommandPrompt {
  return {
    type: PromptKind.FastCommand,
    series,
    commandName,
    content: '',
    length: 0,
    filePathKind: FilePathKind.Relative,
    dir: createMockRelativePath('.', '/test'),
    markdownContents: [],
  } as FastCommandPrompt
}

// Create a testable subclass to expose private methods
class TestableKiroCLIOutputPlugin extends KiroCLIOutputPlugin {
  public testBuildFastCommandSteeringFileName(cmd: FastCommandPrompt): string {
    // Access private method via any cast
    return (this as any).buildFastCommandSteeringFileName(cmd)
  }

  public testBuildPowerFrontMatter(frontMatter: SkillYAMLFrontMatter): string {
    // Access private method via any cast
    return (this as any).buildPowerFrontMatter(frontMatter)
  }
}

describe('kiroCLIOutputPlugin', () => {
  /**
   * Feature: fast-command-series, Property 6: Kiro Underscore to Hyphen Transformation
   * Validates: Requirements 4.1, 4.2
   *
   * For any fast command processed by KiroCLIOutputPlugin,
   * all underscores in the output filename SHALL be replaced with hyphens.
   */
  describe('buildFastCommandSteeringFileName', () => {
    // Generator for alphanumeric strings without underscore (for series prefix)
    const alphanumericNoUnderscore = fc.string({ minLength: 1, maxLength: 10, unit: 'grapheme-ascii' })
      .filter((s) => /^[a-z0-9]+$/i.test(s))

    // Generator for alphanumeric strings (for command name)
    const alphanumericCommandName = fc.string({ minLength: 1, maxLength: 20, unit: 'grapheme-ascii' })
      .filter((s) => /^\w+$/.test(s))

    it('should use hyphen separator between series and command name', () => {
      fc.assert(
        fc.property(
          alphanumericNoUnderscore,
          alphanumericCommandName,
          (series, commandName) => {
            const plugin = new TestableKiroCLIOutputPlugin()
            const cmd = createMockFastCommandPrompt(series, commandName)

            const result = plugin.testBuildFastCommandSteeringFileName(cmd)

            // Should use hyphen separator instead of underscore
            expect(result).toBe(`${series}-${commandName}.md`)
          },
        ),
        { numRuns: 100 },
      )
    })

    it('should return just commandName.md when series is undefined', () => {
      fc.assert(
        fc.property(
          alphanumericCommandName,
          (commandName) => {
            const plugin = new TestableKiroCLIOutputPlugin()
            const cmd = createMockFastCommandPrompt(void 0, commandName)

            const result = plugin.testBuildFastCommandSteeringFileName(cmd)

            // Should return just commandName without any prefix
            expect(result).toBe(`${commandName}.md`)
          },
        ),
        { numRuns: 100 },
      )
    })

    // Unit tests for specific examples
    it('should transform pe_compile to pe-compile.md', () => {
      const plugin = new TestableKiroCLIOutputPlugin()
      const cmd = createMockFastCommandPrompt('pe', 'compile')

      const result = plugin.testBuildFastCommandSteeringFileName(cmd)

      expect(result).toBe('pe-compile.md')
    })

    it('should transform spec_requirement to spec-requirement.md', () => {
      const plugin = new TestableKiroCLIOutputPlugin()
      const cmd = createMockFastCommandPrompt('spec', 'requirement')

      const result = plugin.testBuildFastCommandSteeringFileName(cmd)

      expect(result).toBe('spec-requirement.md')
    })

    it('should handle command without series', () => {
      const plugin = new TestableKiroCLIOutputPlugin()
      const cmd = createMockFastCommandPrompt(void 0, 'compile')

      const result = plugin.testBuildFastCommandSteeringFileName(cmd)

      expect(result).toBe('compile.md')
    })
  })

  /**
   * Feature: kiro-powers-skill-output, POWER.md Front Matter
   * Validates: Requirements for YAML front matter output in POWER.md
   */
  describe('buildPowerFrontMatter', () => {
    it('should include name and description in front matter', () => {
      const plugin = new TestableKiroCLIOutputPlugin()
      const frontMatter = {
        name: 'test-skill',
        description: 'A test skill',
      } as SkillYAMLFrontMatter

      const result = plugin.testBuildPowerFrontMatter(frontMatter)

      expect(result).toContain('---')
      expect(result).toContain('name: "test-skill"')
      expect(result).toContain('description: "A test skill"')
    })

    it('should include displayName when provided', () => {
      const plugin = new TestableKiroCLIOutputPlugin()
      const frontMatter = {
        name: 'test-skill',
        description: 'A test skill',
        displayName: 'Test Skill Display',
      } as SkillYAMLFrontMatter

      const result = plugin.testBuildPowerFrontMatter(frontMatter)

      expect(result).toContain('displayName: "Test Skill Display"')
    })

    it('should include keywords array when provided', () => {
      const plugin = new TestableKiroCLIOutputPlugin()
      const frontMatter = {
        name: 'test-skill',
        description: 'A test skill',
        keywords: ['typescript', 'testing', 'cli'],
      } as SkillYAMLFrontMatter

      const result = plugin.testBuildPowerFrontMatter(frontMatter)

      expect(result).toContain('keywords: ["typescript", "testing", "cli"]')
    })

    it('should include author when provided', () => {
      const plugin = new TestableKiroCLIOutputPlugin()
      const frontMatter = {
        name: 'test-skill',
        description: 'A test skill',
        author: 'Test Author',
      } as SkillYAMLFrontMatter

      const result = plugin.testBuildPowerFrontMatter(frontMatter)

      expect(result).toContain('author: "Test Author"')
    })

    it('should omit optional fields when not provided', () => {
      const plugin = new TestableKiroCLIOutputPlugin()
      const frontMatter = {
        name: 'minimal-skill',
        description: '',
      } as SkillYAMLFrontMatter

      const result = plugin.testBuildPowerFrontMatter(frontMatter)

      expect(result).not.toContain('displayName')
      expect(result).not.toContain('keywords')
      expect(result).not.toContain('author')
    })

    it('should produce valid YAML front matter format', () => {
      const plugin = new TestableKiroCLIOutputPlugin()
      const frontMatter = {
        name: 'full-skill',
        description: 'Full featured skill',
        displayName: 'Full Skill',
        keywords: ['feature', 'complete'],
        author: 'Developer',
      } as SkillYAMLFrontMatter

      const result = plugin.testBuildPowerFrontMatter(frontMatter)

      // Should start and end with ---
      expect(result.startsWith('---')).toBe(true)
      expect(result.endsWith('---')).toBe(true)

      // Should have proper line structure
      const lines = result.split('\n')
      expect(lines[0]).toBe('---')
      expect(lines[lines.length - 1]).toBe('---')
    })
  })
})
