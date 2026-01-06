import type { ILogger } from '@/log'
import type {
  CollectedInputContext,
  InputPluginContext,
  McpServerConfig,
  SkillChildDoc,
  SkillMcpConfig,
  SkillPrompt,
  SkillResource,
  SkillResourceCategory,
  SkillResourceEncoding,
  SkillYAMLFrontMatter,
} from '@/types'

import { Buffer } from 'node:buffer'
import * as path from 'node:path'
import { mdxToMd } from '@/compiler'
import { parseMarkdown } from '@/markdown'
import {
  FilePathKind,
  MetadataValidationError,
  PromptKind,
  validateSkillMetadata,
} from '@/types'
import {
  SKILL_RESOURCE_BINARY_EXTENSIONS,
} from '@/types/InputTypes'
import { AbstractInputPlugin } from './AbstractInputPlugin'

/**
 * Converts .mdx file references to .md in markdown content.
 * Only converts local file references (not external URLs).
 *
 * Handles:
 * - Markdown links: [text](file.mdx) -> [text](file.md)
 * - Markdown images: ![alt](file.mdx) -> ![alt](file.md)
 * - Preserves anchors and query params: file.mdx#section -> file.md#section
 *
 * @param content - The markdown content to transform
 * @returns The transformed content with .mdx replaced by .md
 */
function transformMdxReferencesToMd(content: string): string {
  // Match markdown links and images: [text](url) or ![alt](url)
  // Capture the URL part and transform .mdx to .md for local references
  return content.replaceAll(
    /(!?\[[^\]]*\]\()([^)]+)(\))/g,
    (match, prefix: string, url: string, suffix: string) => {
      // Skip external URLs (http://, https://, //, etc.)
      if (/^(?:https?:)?\/\//.test(url)) return match
      // Convert .mdx to .md for local file references
      // Simple replacement: .mdx at end or before # or ?
      const transformedUrl = url
        .replace(/\.mdx$/, '.md')
        .replace(/\.mdx#/, '.md#')
        .replace(/\.mdx\?/, '.md?')
      return `${prefix}${transformedUrl}${suffix}`
    },
  )
}

export class SkillInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('SkillInputPlugin')
  }

  /**
   * Read MCP configuration file (mcp.json) from skill directory.
   *
   * @param skillDir - The absolute path to the skill directory
   * @param fs - The file system module
   * @param logger - ILogger instance for warnings
   * @returns SkillMcpConfig object or undefined if not found
   */
  readMcpConfig(
    skillDir: string,
    fs: typeof import('node:fs'),
    logger: ILogger,
  ): SkillMcpConfig | void {
    const mcpJsonPath = path.join(skillDir, 'mcp.json')

    if (!fs.existsSync(mcpJsonPath)) return void 0

    if (!fs.statSync(mcpJsonPath).isFile()) {
      logger.warn('mcp.json is not a file', { skillDir })
      return void 0
    }

    try {
      const rawContent = fs.readFileSync(mcpJsonPath, 'utf8')
      const parsed = JSON.parse(rawContent) as { mcpServers?: Record<string, McpServerConfig> }

      if (parsed.mcpServers == null || typeof parsed.mcpServers !== 'object') {
        logger.warn('mcp.json missing mcpServers field', { skillDir })
        return void 0
      }

      return {
        type: PromptKind.SkillMcpConfig,
        mcpServers: parsed.mcpServers,
        rawContent,
      }
    } catch (e) {
      logger.warn('failed to parse mcp.json', { skillDir, error: e })
      return void 0
    }
  }

  /**
   * Check if a file extension is a binary resource extension.
   *
   * @param ext - The file extension (including the dot)
   * @returns true if the extension is a binary type
   */
  isBinaryResourceExtension(ext: string): boolean {
    return (SKILL_RESOURCE_BINARY_EXTENSIONS as readonly string[]).includes(ext.toLowerCase())
  }

  /**
   * Determine the resource category based on file extension.
   *
   * @param ext - The file extension (including the dot)
   * @returns The resource category
   */
  getResourceCategory(ext: string): SkillResourceCategory {
    const lowerExt = ext.toLowerCase()

    // Image files
    const imageExtensions = [
      '.png',
      '.jpg',
      '.jpeg',
      '.gif',
      '.webp',
      '.ico',
      '.bmp',
      '.tiff',
      '.svg',
    ]
    if (imageExtensions.includes(lowerExt)) return 'image'

    // Code files
    const codeExtensions = [
      '.kt',
      '.java',
      '.py',
      '.pyi',
      '.pyx',
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.mjs',
      '.cjs',
      '.go',
      '.rs',
      '.c',
      '.cpp',
      '.cc',
      '.h',
      '.hpp',
      '.hxx',
      '.cs',
      '.fs',
      '.fsx',
      '.vb',
      '.rb',
      '.php',
      '.swift',
      '.scala',
      '.groovy',
      '.lua',
      '.r',
      '.jl',
      '.ex',
      '.exs',
      '.erl',
      '.clj',
      '.cljs',
      '.hs',
      '.ml',
      '.mli',
      '.nim',
      '.zig',
      '.v',
      '.dart',
      '.vue',
      '.svelte',
      '.d.ts',
      '.d.mts',
      '.d.cts',
    ]
    if (codeExtensions.includes(lowerExt)) return 'code'

    // Data files
    const dataExtensions = [
      '.sql',
      '.json',
      '.jsonc',
      '.json5',
      '.xml',
      '.xsd',
      '.xsl',
      '.xslt',
      '.yaml',
      '.yml',
      '.toml',
      '.csv',
      '.tsv',
      '.graphql',
      '.gql',
      '.proto',
    ]
    if (dataExtensions.includes(lowerExt)) return 'data'

    // Document files
    const documentExtensions = [
      '.txt',
      '.text',
      '.rtf',
      '.log',
      '.docx',
      '.doc',
      '.xlsx',
      '.xls',
      '.pptx',
      '.ppt',
      '.pdf',
      '.odt',
      '.ods',
      '.odp',
    ]
    if (documentExtensions.includes(lowerExt)) return 'document'

    // Config files
    const configExtensions = [
      '.ini',
      '.conf',
      '.cfg',
      '.config',
      '.properties',
      '.env',
      '.envrc',
      '.editorconfig',
      '.gitignore',
      '.gitattributes',
      '.npmrc',
      '.nvmrc',
      '.npmignore',
      '.eslintrc',
      '.prettierrc',
      '.stylelintrc',
      '.babelrc',
      '.browserslistrc',
    ]
    if (configExtensions.includes(lowerExt)) return 'config'

    // Script files
    const scriptExtensions = [
      '.sh',
      '.bash',
      '.zsh',
      '.fish',
      '.ps1',
      '.psm1',
      '.psd1',
      '.bat',
      '.cmd',
    ]
    if (scriptExtensions.includes(lowerExt)) return 'script'

    // Binary files
    const binaryExtensions = [
      '.exe',
      '.dll',
      '.so',
      '.dylib',
      '.bin',
      '.wasm',
      '.class',
      '.jar',
      '.war',
      '.pyd',
      '.pyc',
      '.pyo',
      '.zip',
      '.tar',
      '.gz',
      '.bz2',
      '.7z',
      '.rar',
      '.ttf',
      '.otf',
      '.woff',
      '.woff2',
      '.eot',
      '.db',
      '.sqlite',
      '.sqlite3',
    ]
    if (binaryExtensions.includes(lowerExt)) return 'binary'

    return 'other'
  }

  /**
   * Get MIME type for a file extension.
   *
   * @param ext - The file extension (including the dot)
   * @returns The MIME type or void 0
   */
  getMimeType(ext: string): string | void {
    const mimeTypes: Record<string, string> = {
      // Code
      '.ts': 'text/typescript',
      '.tsx': 'text/typescript',
      '.js': 'text/javascript',
      '.jsx': 'text/javascript',
      '.json': 'application/json',
      '.py': 'text/x-python',
      '.java': 'text/x-java',
      '.kt': 'text/x-kotlin',
      '.go': 'text/x-go',
      '.rs': 'text/x-rust',
      '.c': 'text/x-c',
      '.cpp': 'text/x-c++',
      '.cs': 'text/x-csharp',
      '.rb': 'text/x-ruby',
      '.php': 'text/x-php',
      '.swift': 'text/x-swift',
      '.scala': 'text/x-scala',
      // Data
      '.sql': 'application/sql',
      '.xml': 'application/xml',
      '.yaml': 'text/yaml',
      '.yml': 'text/yaml',
      '.toml': 'text/toml',
      '.csv': 'text/csv',
      '.graphql': 'application/graphql',
      // Documents
      '.txt': 'text/plain',
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // Web
      '.html': 'text/html',
      '.css': 'text/css',
      '.svg': 'image/svg+xml',
      // Images
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.ico': 'image/x-icon',
      '.bmp': 'image/bmp',
    }
    return mimeTypes[ext.toLowerCase()]
  }

  /**
   * Recursively scan skill directory for child docs and resources.
   * Child docs: all .mdx files except skill.mdx
   * Resources: all non-.mdx files except mcp.json
   *
   * @param skillDir - The absolute path to the skill directory
   * @param fs - The file system module
   * @param logger - ILogger instance for warnings
   * @param currentRelativePath - Current relative path from skill root (for recursion)
   * @returns Object containing childDocs and resources arrays
   */
  scanSkillDirectory(
    skillDir: string,
    fs: typeof import('node:fs'),
    logger: ILogger,
    currentRelativePath: string = '',
  ): { childDocs: SkillChildDoc[], resources: SkillResource[] } {
    const childDocs: SkillChildDoc[] = []
    const resources: SkillResource[] = []

    const currentDir = currentRelativePath
      ? path.join(skillDir, currentRelativePath)
      : skillDir

    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true })

      for (const entry of entries) {
        const relativePath = currentRelativePath
          ? `${currentRelativePath}/${entry.name}`
          : entry.name

        if (entry.isDirectory()) {
          // Recursively scan subdirectories
          const subResult = this.scanSkillDirectory(skillDir, fs, logger, relativePath)
          childDocs.push(...subResult.childDocs)
          resources.push(...subResult.resources)
        } else if (entry.isFile()) {
          const filePath = path.join(currentDir, entry.name)

          // Handle .mdx files as child docs (except skill.mdx at root)
          if (entry.name.endsWith('.mdx')) {
            // Skip skill.mdx at root level
            if (currentRelativePath === '' && entry.name === 'skill.mdx') continue

            try {
              const rawContent = fs.readFileSync(filePath, 'utf8')
              const parsed = parseMarkdown(rawContent)
              // Transform .mdx references to .md in child doc content
              const content = transformMdxReferencesToMd(parsed.contentWithoutFrontMatter)

              childDocs.push({
                type: PromptKind.SkillChildDoc,
                content,
                length: content.length,
                filePathKind: FilePathKind.Relative,
                markdownAst: parsed.markdownAst,
                markdownContents: parsed.markdownContents,
                ...(parsed.rawFrontMatter != null && { rawFrontMatter: parsed.rawFrontMatter }),
                relativePath,
                dir: {
                  pathKind: FilePathKind.Relative,
                  path: relativePath,
                  basePath: skillDir,
                  getDirectoryName: () => path.dirname(relativePath),
                  getAbsolutePath: () => filePath,
                },
              } as SkillChildDoc)
            } catch (e) {
              logger.warn('failed to read child doc', { path: relativePath, error: e })
            }
          } else {
            // Handle non-.mdx files as resources (except mcp.json at root)
            if (currentRelativePath === '' && entry.name === 'mcp.json') continue

            const ext = path.extname(entry.name)
            let content: string
            let encoding: SkillResourceEncoding
            let length: number

            try {
              if (this.isBinaryResourceExtension(ext)) {
                // Read as binary and encode to base64
                const buffer = fs.readFileSync(filePath)
                content = buffer.toString('base64')
                encoding = 'base64'
                ; ({ length } = buffer)
              } else {
                // Read as UTF-8 text (default for unknown extensions too)
                content = fs.readFileSync(filePath, 'utf8')
                encoding = 'text'
                ; ({ length } = Buffer.from(content, 'utf8'))
              }

              const mimeType = this.getMimeType(ext)
              const resource: SkillResource = {
                type: PromptKind.SkillResource,
                extension: ext,
                fileName: entry.name,
                relativePath,
                content,
                encoding,
                category: this.getResourceCategory(ext),
                length,
              }

              if (mimeType != null) resources.push({ ...resource, mimeType })
              else resources.push(resource)
            } catch (e) {
              logger.warn('failed to read resource file', { path: relativePath, error: e })
            }
          }
        }
      }
    } catch (e) {
      logger.warn('failed to scan directory', { path: currentDir, error: e })
    }

    return { childDocs, resources }
  }

  async collect(ctx: InputPluginContext): Promise<Partial<CollectedInputContext>> {
    const { userConfigOptions: options, logger, globalScope } = ctx
    const { workspaceDir, shadowProjectDir } = this.resolveBasePaths(options)

    const skillDirRaw = options.shadowSkillSourceDir
    const skillDir = this.resolvePath(skillDirRaw, workspaceDir, shadowProjectDir)

    const skills: SkillPrompt[] = []
    if (!(ctx.fs.existsSync(skillDir) && ctx.fs.statSync(skillDir).isDirectory())) return { skills }

    const entries = ctx.fs.readdirSync(skillDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillFilePath = ctx.path.join(skillDir, entry.name, 'skill.mdx')
        if (ctx.fs.existsSync(skillFilePath) && ctx.fs.statSync(skillFilePath).isFile()) {
          try {
            const rawContent = ctx.fs.readFileSync(skillFilePath, 'utf8')

            // Parse YAML front matter first for backward compatibility
            const parsed = parseMarkdown<SkillYAMLFrontMatter>(rawContent)

            // Compile MDX with globalScope and extract metadata from exports
            const compileResult = await mdxToMd(rawContent, {
              globalScope,
              extractMetadata: true,
              basePath: ctx.path.join(skillDir, entry.name),
            })

            // Merge YAML front matter with export metadata (export takes priority)
            const mergedFrontMatter: SkillYAMLFrontMatter = {
              ...parsed.yamlFrontMatter,
              ...compileResult.metadata.fields,
            } as SkillYAMLFrontMatter

            // Validate merged metadata
            const validationResult = validateSkillMetadata(
              mergedFrontMatter as Record<string, unknown>,
              skillFilePath,
            )

            // Log validation warnings
            for (const warning of validationResult.warnings) {
              logger.debug(warning)
            }

            // Throw error if validation fails (missing required fields)
            if (!validationResult.valid) throw new MetadataValidationError(validationResult.errors, skillFilePath)

            // Use compiled content and transform .mdx references to .md
            const content = transformMdxReferencesToMd(compileResult.content)

            const skillAbsoluteDir = ctx.path.join(skillDir, entry.name)

            // Read MCP configuration (mcp.json)
            const mcpConfig = this.readMcpConfig(skillAbsoluteDir, ctx.fs, logger)

            // Recursively scan for child docs and resources
            const { childDocs, resources } = this.scanSkillDirectory(
              skillAbsoluteDir,
              ctx.fs,
              logger,
            )

            // Log metadata source for debugging
            logger.debug('skill metadata extracted', {
              skill: entry.name,
              source: compileResult.metadata.source,
              hasYaml: parsed.yamlFrontMatter != null,
              hasExport: Object.keys(compileResult.metadata.fields).length > 0,
            })

            skills.push({
              type: PromptKind.Skill,
              content,
              length: content.length,
              filePathKind: FilePathKind.Relative,
              yamlFrontMatter: mergedFrontMatter.name != null
                ? mergedFrontMatter
                : { name: entry.name, description: '' } as SkillYAMLFrontMatter,
              ...(parsed.rawFrontMatter != null && { rawFrontMatter: parsed.rawFrontMatter }),
              markdownAst: parsed.markdownAst,
              markdownContents: parsed.markdownContents,
              // Include MCP configuration if found
              ...(mcpConfig != null && { mcpConfig }),
              // Include child docs if any were found
              ...(childDocs.length > 0 && { childDocs }),
              // Include resources if any were found
              ...(resources.length > 0 && { resources }),
              dir: {
                pathKind: FilePathKind.Relative,
                path: entry.name,
                basePath: skillDir,
                getDirectoryName: () => entry.name,
                getAbsolutePath: () => path.join(skillDir, entry.name),
              },
            })
          } catch (e) {
            logger.error('failed to parse skill', { file: skillFilePath, error: e })
          }
        }
      }
    }
    return { skills }
  }
}
