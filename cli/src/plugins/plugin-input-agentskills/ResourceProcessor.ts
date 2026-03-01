import type {ILogger, SkillChildDoc, SkillResource, SkillResourceEncoding} from '@truenine/plugin-shared'
import type {Dirent} from 'node:fs'
import {Buffer} from 'node:buffer'
import * as nodePath from 'node:path'
import {parseMarkdown, transformMdxReferencesToMd} from '@truenine/md-compiler/markdown'
import {FilePathKind, PromptKind} from '@truenine/plugin-shared'
import {getMimeType, getResourceCategory, isBinaryResourceExtension} from './config/fileTypes'

/**
 * Portable path join that works with Unix-style paths in tests across all platforms
 */
function pathJoin(...segments: string[]): string {
  const joined = nodePath.join(...segments) // Normalize to forward slashes for consistent behavior
  return joined.replaceAll('\\', '/')
}

export interface ResourceScanResult {
  readonly childDocs: SkillChildDoc[]
  readonly resources: SkillResource[]
}

export interface ResourceProcessorContext {
  readonly fs: typeof import('node:fs')
  readonly logger: ILogger
  readonly skillDir: string
}

/**
 * Resource processor for scanning and processing skill directory contents
 * Extracted from SkillInputPlugin to reduce complexity and nesting
 */
export class ResourceProcessor {
  private readonly ctx: ResourceProcessorContext

  constructor(ctx: ResourceProcessorContext) {
    this.ctx = ctx
  }

  processDirectory(entry: Dirent, currentRelativePath: string, filePath: string): ResourceScanResult {
    const relativePath = currentRelativePath
      ? `${currentRelativePath}/${entry.name}`
      : entry.name

    return this.scanSkillDirectory(filePath, relativePath)
  }

  processFile(entry: Dirent, currentRelativePath: string, filePath: string): ResourceScanResult {
    const relativePath = currentRelativePath
      ? `${currentRelativePath}/${entry.name}`
      : entry.name

    if (currentRelativePath === '' && entry.name === 'skill.mdx') { // Skip skill.mdx in root directory (handled separately)
      return {childDocs: [], resources: []}
    }

    if (currentRelativePath === '' && entry.name === 'mcp.json') { // Skip mcp.json in root directory (handled separately)
      return {childDocs: [], resources: []}
    }

    if (entry.name.endsWith('.mdx')) {
      const childDoc = this.processChildDoc(entry.name, relativePath, filePath)
      return {childDocs: childDoc ? [childDoc] : [], resources: []}
    }

    const resource = this.processResourceFile(entry.name, relativePath, filePath)
    return {childDocs: [], resources: resource ? [resource] : []}
  }

  private processChildDoc(_fileName: string, relativePath: string, filePath: string): SkillChildDoc | null {
    try {
      const rawContent = this.ctx.fs.readFileSync(filePath, 'utf8')
      const parsed = parseMarkdown(rawContent)
      const content = transformMdxReferencesToMd(parsed.contentWithoutFrontMatter)

      return {
        type: PromptKind.SkillChildDoc,
        content,
        length: content.length,
        filePathKind: FilePathKind.Relative,
        markdownAst: parsed.markdownAst,
        markdownContents: parsed.markdownContents,
        ...parsed.rawFrontMatter != null && {rawFrontMatter: parsed.rawFrontMatter},
        relativePath,
        dir: {
          pathKind: FilePathKind.Relative,
          path: relativePath,
          basePath: this.ctx.skillDir,
          getDirectoryName: () => nodePath.dirname(relativePath),
          getAbsolutePath: () => filePath
        }
      }
    }
    catch (e) {
      this.ctx.logger.warn('failed to read child doc', {path: relativePath, error: e})
      return null
    }
  }

  private processResourceFile(fileName: string, relativePath: string, filePath: string): SkillResource | null {
    const ext = nodePath.extname(fileName)

    try {
      const {content, encoding, length} = this.readFileContent(filePath, ext)
      const mimeType = getMimeType(ext)

      const resource: SkillResource = {
        type: PromptKind.SkillResource,
        extension: ext,
        fileName,
        relativePath,
        content,
        encoding,
        category: getResourceCategory(ext),
        length,
        ...mimeType != null && {mimeType}
      }

      return resource
    }
    catch (e) {
      this.ctx.logger.warn('failed to read resource file', {path: relativePath, error: e})
      return null
    }
  }

  private readFileContent(filePath: string, ext: string): {content: string, encoding: SkillResourceEncoding, length: number} {
    if (isBinaryResourceExtension(ext)) {
      const buffer = this.ctx.fs.readFileSync(filePath)
      return {
        content: buffer.toString('base64'),
        encoding: 'base64',
        length: buffer.length
      }
    }

    const content = this.ctx.fs.readFileSync(filePath, 'utf8')
    return {
      content,
      encoding: 'text',
      length: Buffer.from(content, 'utf8').length
    }
  }

  scanSkillDirectory(currentDir: string, currentRelativePath: string = ''): ResourceScanResult {
    const childDocs: SkillChildDoc[] = []
    const resources: SkillResource[] = []

    let entries: Dirent[]
    try {
      entries = this.ctx.fs.readdirSync(currentDir, {withFileTypes: true})
    }
    catch (e) {
      this.ctx.logger.warn('failed to scan directory', {path: currentDir, error: e})
      return {childDocs, resources}
    }

    for (const entry of entries) {
      const filePath = pathJoin(currentDir, entry.name)

      if (entry.isDirectory()) {
        const subResult = this.processDirectory(entry, currentRelativePath, filePath)
        childDocs.push(...subResult.childDocs)
        resources.push(...subResult.resources)
        continue
      }

      if (!entry.isFile()) continue

      const fileResult = this.processFile(entry, currentRelativePath, filePath)
      childDocs.push(...fileResult.childDocs)
      resources.push(...fileResult.resources)
    }

    return {childDocs, resources}
  }
}
