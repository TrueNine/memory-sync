import type { FrontMatterOptions } from '../../core/types'
import { addFrontMatter, generateFrontMatter } from '../../core/capabilities'
import { FrontMatterType } from '../../core/types'
import { generateRefFileName } from '../../pathResolver'

/**
 * Options for in-memory rule processing
 */
export interface MemoryRuleOptions {
  /**
   * Content to process
   */
  content: string
  /**
   * Project name for filename generation
   */
  projectName: string
  /**
   * Relative path for filename generation
   */
  relativePath: string
  /**
   * Front matter type to apply
   */
  frontMatterType: FrontMatterType
  /**
   * Optional pattern for file matching or glob
   * If not provided, will be auto-generated based on relativePath
   */
  pattern?: string
}

/**
 * Result of in-memory rule processing
 */
export interface ProcessedRule {
  /**
   * Generated filename with ref prefix
   */
  filename: string
  /**
   * Content with front matter prepended
   */
  content: string
}

/**
 * Service for processing rules in memory without writing to disk
 */
export class MemoryRuleProcessor {
  /**
   * Process rule content in memory
   *
   * @param options - Memory rule processing options
   * @returns Processed rule with filename and content
   */
  processRule(options: MemoryRuleOptions): ProcessedRule {
    const { content, projectName, relativePath, frontMatterType, pattern } = options

    // Generate filename using ref naming convention
    const filename = generateRefFileName({ projectName, relativePath })

    // Determine pattern for front matter if needed
    let frontMatterPattern: string | undefined = pattern
    if (
      (frontMatterType === FrontMatterType.KIRO_FILE_MATCH
        || frontMatterType === FrontMatterType.QODER_GLOB
        || frontMatterType === FrontMatterType.ANTIGRAVITY_GLOB)
      && frontMatterPattern == null
    ) {
      // Auto-generate pattern from relative path
      const normalizedPath = relativePath.replace(/\\/g, '/')
      const dirPath = normalizedPath.split('/').slice(0, -1).join('/')

      if (dirPath === '' || dirPath === '.') {
        frontMatterPattern = '**/*'
      } else {
        frontMatterPattern = `${dirPath}/**/*`
      }
    }

    // Generate front matter
    const frontMatterOptions: FrontMatterOptions = {
      type: frontMatterType,
      ...(frontMatterPattern != null ? { pattern: frontMatterPattern } : {}),
    }
    const frontMatter = generateFrontMatter(frontMatterOptions)

    // Add front matter to content
    const processedContent = addFrontMatter(content, frontMatter)

    return {
      filename,
      content: processedContent,
    }
  }
}
