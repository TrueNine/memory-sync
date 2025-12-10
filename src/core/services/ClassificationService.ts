/**
 * Input bundle classification service
 * Handles classification of input bundles based on configuration rules
 */

/* eslint-disable no-undefined */

import type {
  InputBundle,
  InputClassificationRule,
  PluginSystemConfig,
} from '../types'
import picomatch from 'picomatch'
import { InputType } from '../types'

/**
 * Service for classifying input bundles
 * Uses configuration rules to determine the type of each bundle
 */
export class ClassificationService {
  private readonly config: PluginSystemConfig
  private readonly patternMatchers: Map<string, (test: string) => boolean>

  constructor(config: PluginSystemConfig) {
    this.config = config
    this.patternMatchers = new Map()

    // Pre-compile pattern matchers for performance
    for (const rule of config.inputClassification.rules) {
      for (const pattern of rule.patterns) {
        const key = `${rule.type}:${pattern}`
        const matcher = picomatch(pattern)
        this.patternMatchers.set(key, matcher)
      }
    }
  }

  /**
   * Classify a single input bundle
   * @param bundle - The input bundle to classify
   * @returns The classified input bundle with type assigned
   */
  classifyBundle(bundle: InputBundle): InputBundle {
    // If bundle already has a type, check if it should be preserved
    if (bundle.type != null && bundle.type !== InputType.CONFIG_FILE) {
      return bundle
    }

    // Classify based on rules
    const classification = this.classifyByRules(bundle)

    // Return new bundle with classification
    return {
      ...bundle,
      type: classification.type,
    }
  }

  /**
   * Classify multiple input bundles
   * @param bundles - Array of input bundles to classify
   * @returns Array of classified input bundles
   */
  classifyBundles(bundles: InputBundle[]): InputBundle[] {
    return bundles.map((bundle) => this.classifyBundle(bundle))
  }

  /**
   * Get front matter for a specific input type
   * @param type - Input type
   * @param bundle - Input bundle for additional context
   * @returns Front matter object or undefined
   */
  getFrontMatter(type: InputType, bundle: InputBundle): Record<string, unknown> | undefined {
    // Check if bundle already has front matter
    if (bundle.frontMatter) {
      return bundle.frontMatter
    }

    // Generate front matter based on type and file content
    return this.generateFrontMatter(type, bundle)
  }

  /**
   * Check if a file path matches a specific input type
   * @param filePath - File path to check
   * @param type - Input type to check against
   * @returns True if the path matches the type
   */
  matchesType(filePath: string, type: InputType): boolean {
    const rules = this.config.inputClassification.rules.filter((rule) => rule.type === type)

    for (const rule of rules) {
      for (const pattern of rule.patterns) {
        const key = `${rule.type}:${pattern}`
        const matcher = this.patternMatchers.get(key)
        if (matcher && matcher(filePath)) {
          return true
        }
      }
    }

    return false
  }

  /**
   * Get all files that should be excluded
   * @returns Array of patterns to exclude
   */
  getExcludePatterns(): string[] {
    // Extract exclude patterns from rules (patterns starting with !)
    const excludePatterns: string[] = []

    for (const rule of this.config.inputClassification.rules) {
      for (const pattern of rule.patterns) {
        if (pattern.startsWith('!')) {
          excludePatterns.push(pattern.slice(1))
        }
      }
    }

    return excludePatterns
  }

  /**
   * Classify bundle based on configuration rules
   * @param bundle - Input bundle to classify
   * @returns Classification result with type
   */
  private classifyByRules(bundle: InputBundle): { type: InputType, rule?: InputClassificationRule } {
    const rules = [...this.config.inputClassification.rules].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
    )

    // Check front matter first for explicit type specification
    if (bundle.frontMatter != null) {
      const frontMatterType = this.classifyByFrontMatter(bundle.frontMatter)
      if (frontMatterType != null) {
        return { type: frontMatterType }
      }
    }

    // Check file path against rules
    for (const rule of rules) {
      for (const pattern of rule.patterns) {
        // Skip exclude patterns (starting with !)
        if (pattern.startsWith('!')) {
          continue
        }

        const key = `${rule.type}:${pattern}`
        const matcher = this.patternMatchers.get(key)
        if (matcher && matcher(bundle.path)) {
          return { type: rule.type, rule }
        }
      }
    }

    // Use default type
    return { type: this.config.inputClassification.defaultType }
  }

  /**
   * Classify based on front matter content
   * @param frontMatter - Parsed front matter object
   * @returns Input type if determined from front matter
   */
  private classifyByFrontMatter(frontMatter: Record<string, unknown>): InputType | undefined {
    // Check for explicit type specification
    if (typeof frontMatter['type'] === 'string') {
      const typeValue = frontMatter['type'].toLowerCase()

      // Map known type values to InputType enum
      switch (typeValue) {
        case 'memory-prompt':
          return InputType.MEMORY_PROMPT
        case 'global-prompt':
        case 'globalprompt':
          return InputType.GLOBAL_PROMPT
        case 'sub-agent':
        case 'subagent':
          return InputType.SUB_AGENT
        case 'fast-command':
        case 'fastcommand':
          return InputType.FAST_COMMAND
        case 'skill':
          return InputType.SKILL
        case 'config':
        case 'config-file':
          return InputType.CONFIG_FILE
      }
    }

    // Check for known front matter patterns
    if (frontMatter['agents'] != null) {
      return InputType.SUB_AGENT
    }

    if (frontMatter['command'] != null) {
      return InputType.FAST_COMMAND
    }

    if (frontMatter['skill'] != null) {
      return InputType.SKILL
    }

    return undefined
  }

  /**
   * Generate front matter for a bundle based on its type
   * @param type - Input type
   * @param bundle - Input bundle for context
   * @returns Front matter object
   */
  private generateFrontMatter(type: InputType, bundle: InputBundle): Record<string, unknown> {
    const frontMatter: Record<string, unknown> = {}

    // Add type information
    switch (type) {
      case InputType.MEMORY_PROMPT:
        frontMatter['type'] = 'memory-prompt'
        break
      case InputType.GLOBAL_PROMPT:
        frontMatter['type'] = 'global-prompt'
        break
      case InputType.SUB_AGENT: {
        frontMatter['type'] = 'sub-agent'
        // Extract agent name from path if possible
        const agentName = this.extractNameFromPath(bundle.path, 'agents')
        if (agentName != null) {
          frontMatter['name'] = agentName
        }
        break
      }
      case InputType.FAST_COMMAND: {
        frontMatter['type'] = 'fast-command'
        // Extract command name from path if possible
        const commandName = this.extractNameFromPath(bundle.path, 'commands')
        if (commandName != null) {
          frontMatter['command'] = commandName
        }
        break
      }
      case InputType.SKILL: {
        frontMatter['type'] = 'skill'
        // Extract skill name from path if possible
        const skillName = this.extractNameFromPath(bundle.path, 'skills')
        if (skillName != null) {
          frontMatter['skill'] = skillName
        }
        break
      }
      case InputType.CONFIG_FILE:
        // No specific front matter for config files
        break
    }

    // Add source project if available
    if (bundle.sourceProject != null) {
      frontMatter['source'] = bundle.sourceProject
    }

    // Add file path for reference
    frontMatter['path'] = bundle.path

    return frontMatter
  }

  /**
   * Extract name from file path based on directory structure
   * @param path - File path
   * @param dirName - Directory name to look for
   * @returns Extracted name or undefined
   */
  private extractNameFromPath(path: string, dirName: string): string | undefined {
    const parts = path.split('/')
    const dirIndex = parts.findIndex((part) => part === dirName)

    if (dirIndex !== -1 && dirIndex + 1 < parts.length) {
      // Get the next part after the directory
      const nameWithExt = parts[dirIndex + 1]
      if (nameWithExt != null) {
        // Remove file extension
        return nameWithExt.replace(/\.[^.]*$/, '')
      }
    }

    return undefined
  }
}
