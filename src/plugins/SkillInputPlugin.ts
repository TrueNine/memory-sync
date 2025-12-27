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

import * as path from 'node:path'
import { DEFAULT_SHADOW_SKILL_SOURCE_DIR } from '@/constants'
import { parseMarkdown } from '@/markdown'
import {
  FilePathKind,
  PromptKind,
} from '@/types'
import {
  SKILL_RESOURCE_BINARY_EXTENSIONS,
} from '@/types/InputTypes'
import { AbstractInputPlugin } from './AbstractInputPlugin'

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

    if (!fs.existsSync(mcpJsonPath)) {
      return void 0
    }

    if (!fs.statSync(mcpJsonPath).isFile()) {
      logger.warn('mcp.json is not a file', { skillDir })
      return void 0
    }

    try {
      const rawContent = fs.readFileSync(mcpJsonPath, 'utf-8')
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
    if (imageExtensions.includes(lowerExt)) {
      return 'image'
    }

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
    if (codeExtensions.includes(lowerExt)) {
      return 'code'
    }

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
    if (dataExtensions.includes(lowerExt)) {
      return 'data'
    }

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
    if (documentExtensions.includes(lowerExt)) {
      return 'document'
    }

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
    if (configExtensions.includes(lowerExt)) {
      return 'config'
    }

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
    if (scriptExtensions.includes(lowerExt)) {
      return 'script'
    }

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
    if (binaryExtensions.includes(lowerExt)) {
      return 'binary'
    }

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
   * Child docs: all .md files except SKILL.md
   * Resources: all non-.md files except mcp.json
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

          // Handle .md files as child docs (except SKILL.md at root)
          if (entry.name.endsWith('.md')) {
            // Skip SKILL.md at root level
            if (currentRelativePath === '' && entry.name === 'SKILL.md') {
              continue
            }

            try {
              const rawContent = fs.readFileSync(filePath, 'utf-8')
              const parsed = parseMarkdown(rawContent)
              const content = parsed.contentWithoutFrontMatter

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
            // Handle non-.md files as resources (except mcp.json at root)
            if (currentRelativePath === '' && entry.name === 'mcp.json') {
              continue
            }

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
                length = buffer.length
              } else {
                // Read as UTF-8 text (default for unknown extensions too)
                content = fs.readFileSync(filePath, 'utf-8')
                encoding = 'text'
                length = globalThis.Buffer.byteLength(content, 'utf-8')
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

              if (mimeType != null) {
                resources.push({ ...resource, mimeType })
              } else {
                resources.push(resource)
              }
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

              const skillAbsoluteDir = ctx.path.join(skillDir, entry.name)

              // Read MCP configuration (mcp.json)
              const mcpConfig = this.readMcpConfig(skillAbsoluteDir, ctx.fs, logger)

              // Recursively scan for child docs and resources
              const { childDocs, resources } = this.scanSkillDirectory(
                skillAbsoluteDir,
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
