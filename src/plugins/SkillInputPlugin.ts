import type { Content, RootContent } from 'mdast'
import type { ILogger } from '@/log'
import type { CollectedInputContext, InputPluginContext, SkillPrompt, SkillReferenceDocument, SkillYAMLFrontMatter } from '@/types'

import * as path from 'node:path'
import { DEFAULT_SHADOW_SKILL_SOURCE_DIR } from '@/constants'
import { parseMarkdown } from '@/markdown'
import {
  FilePathKind,
  PromptKind,
} from '@/types'
import { AbstractInputPlugin } from './AbstractInputPlugin'

/**
 * Extracted link from Markdown content
 */
export interface ExtractedLink {
  readonly text: string
  readonly path: string
}

export class SkillInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('SkillInputPlugin')
  }

  /**
   * Extract local reference document links from Markdown AST.
   * Filters out external URLs (http://, https://) and absolute paths (starting with /).
   *
   * @param markdownContents - The Markdown AST content nodes
   * @returns Array of extracted links with text and path
   */
  extractReferenceDocumentLinks(markdownContents: readonly RootContent[]): ExtractedLink[] {
    const links: ExtractedLink[] = []

    const visitNode = (node: RootContent | Content): void => {
      // Check if this is a link node
      if (node.type === 'link') {
        const linkNode = node as { url: string, children: Array<{ type: string, value?: string }> }
        const url = linkNode.url

        // Filter out external links (http:// or https://)
        if (url.startsWith('http://') || url.startsWith('https://')) {
          return
        }

        // Filter out absolute paths (starting with /)
        if (url.startsWith('/')) {
          return
        }

        // Extract text from link children
        const textParts: string[] = []
        for (const child of linkNode.children) {
          if (child.type === 'text' && child.value != null) {
            textParts.push(child.value)
          }
        }

        links.push({
          text: textParts.join(''),
          path: url,
        })
      }

      // Recursively visit children if they exist
      if ('children' in node && Array.isArray(node.children)) {
        for (const child of node.children) {
          visitNode(child as Content)
        }
      }
    }

    for (const content of markdownContents) {
      visitNode(content)
    }

    return links
  }

  /**
   * Read reference documents from the file system.
   * Resolves link paths relative to the skill directory and reads file contents.
   * Logs warnings for non-existent files and continues processing.
   *
   * @param skillDir - The absolute path to the skill directory
   * @param links - Array of extracted links to read
   * @param fs - The file system module
   * @param logger - ILogger instance for warnings
   * @returns Array of SkillReferenceDocument objects
   */
  readReferenceDocuments(
    skillDir: string,
    links: ExtractedLink[],
    fs: typeof import('node:fs'),
    logger: ILogger,
  ): SkillReferenceDocument[] {
    const documents: SkillReferenceDocument[] = []

    for (const link of links) {
      // Resolve the link path relative to skill directory
      const absolutePath = path.resolve(skillDir, link.path)

      // Check if file exists
      if (!fs.existsSync(absolutePath)) {
        logger.warn('reference document not found', { path: link.path, skillDir })
        continue
      }

      // Check if it's a file (not a directory)
      if (!fs.statSync(absolutePath).isFile()) {
        logger.warn('reference document path is not a file', { path: link.path })
        continue
      }

      try {
        const rawContent = fs.readFileSync(absolutePath, 'utf-8')
        const parsed = parseMarkdown(rawContent)
        const content = parsed.contentWithoutFrontMatter

        // Get the directory from the link path
        const fileDir = path.dirname(link.path)

        documents.push({
          type: PromptKind.SkillReferenceDocument,
          content,
          length: content.length,
          filePathKind: FilePathKind.Relative,
          markdownAst: parsed.markdownAst,
          markdownContents: parsed.markdownContents,
          ...(parsed.rawFrontMatter != null && { rawFrontMatter: parsed.rawFrontMatter }),
          dir: {
            pathKind: FilePathKind.Relative,
            path: link.path,
            basePath: skillDir,
            getDirectoryName: () => fileDir === '.' ? '' : fileDir,
            getAbsolutePath: () => absolutePath,
          },
        } as SkillReferenceDocument)
      } catch (e) {
        logger.warn('failed to read reference document', { path: link.path, error: e })
      }
    }

    return documents
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const { userConfigOptions: options, logger } = ctx
    const { workspaceDir, shadowProjectDir } = this.resolveBasePaths(options)

    const skillDirRaw = options.shadowSkillSourceDir ?? DEFAULT_SHADOW_SKILL_SOURCE_DIR
    const skillDir = this.resolvePath(skillDirRaw, workspaceDir, shadowProjectDir)

    const skills: SkillPrompt[] = []
    if (ctx.fs.existsSync(skillDir) && ctx.fs.statSync(skillDir).isDirectory()) {
      try {
        const entries = ctx.fs.readdirSync(skillDir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const skillFilePath = ctx.path.join(skillDir, entry.name, 'SKILL.md')
            if (ctx.fs.existsSync(skillFilePath) && ctx.fs.statSync(skillFilePath).isFile()) {
              const rawContent = ctx.fs.readFileSync(skillFilePath, 'utf-8')
              const parsed = parseMarkdown<SkillYAMLFrontMatter>(rawContent)
              const content = parsed.contentWithoutFrontMatter

              // Extract reference document links from Markdown AST
              const links = this.extractReferenceDocumentLinks(parsed.markdownContents)

              // Read reference documents from file system
              const skillAbsoluteDir = ctx.path.join(skillDir, entry.name)
              const referenceDocuments = this.readReferenceDocuments(
                skillAbsoluteDir,
                links,
                ctx.fs,
                logger,
              )

              skills.push({
                type: PromptKind.Skill,
                content,
                length: content.length,
                filePathKind: FilePathKind.Relative,
                yamlFrontMatter: parsed.yamlFrontMatter ?? { name: entry.name, description: '' } as SkillYAMLFrontMatter,
                ...(parsed.rawFrontMatter != null && { rawFrontMatter: parsed.rawFrontMatter }),
                markdownAst: parsed.markdownAst,
                markdownContents: parsed.markdownContents,
                // Include reference documents if any were found
                ...(referenceDocuments.length > 0 && { referenceDocuments }),
                dir: {
                  pathKind: FilePathKind.Relative,
                  path: entry.name,
                  basePath: skillDir,
                  getDirectoryName: () => entry.name,
                  getAbsolutePath: () => path.join(skillDir, entry.name),
                },
              })
            }
          }
        }
      } catch (e) {
        logger.error('failed to scan skills', { path: skillDir, error: e })
      }
    }

    return { skills }
  }
}
