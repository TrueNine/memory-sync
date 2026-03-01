import type {CollectedInputContext, ILogger, InputPluginContext, McpServerConfig, SkillChildDoc, SkillMcpConfig, SkillPrompt, SkillResource, SkillResourceCategory, SkillResourceEncoding, SkillYAMLFrontMatter} from '@truenine/plugin-shared'

import {Buffer} from 'node:buffer'
import * as path from 'node:path'
import {mdxToMd} from '@truenine/md-compiler'
import {MetadataValidationError} from '@truenine/md-compiler/errors'
import {parseMarkdown, transformMdxReferencesToMd} from '@truenine/md-compiler/markdown'
import {AbstractInputPlugin} from '@truenine/plugin-input-shared'
import {
  FilePathKind,
  PromptKind,
  SKILL_RESOURCE_BINARY_EXTENSIONS,
  validateSkillMetadata
} from '@truenine/plugin-shared'

function isBinaryResourceExtension(ext: string): boolean {
  return (SKILL_RESOURCE_BINARY_EXTENSIONS as readonly string[]).includes(ext.toLowerCase())
}

function getResourceCategory(ext: string): SkillResourceCategory {
  const lowerExt = ext.toLowerCase()

  const imageExtensions = [
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.ico',
    '.bmp',
    '.tiff',
    '.svg'
  ]
  if (imageExtensions.includes(lowerExt)) return 'image'

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
    '.d.cts'
  ]
  if (codeExtensions.includes(lowerExt)) return 'code'

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
    '.proto'
  ]
  if (dataExtensions.includes(lowerExt)) return 'data'

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
    '.odp'
  ]
  if (documentExtensions.includes(lowerExt)) return 'document'

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
    '.browserslistrc'
  ]
  if (configExtensions.includes(lowerExt)) return 'config'

  const scriptExtensions = [
    '.sh',
    '.bash',
    '.zsh',
    '.fish',
    '.ps1',
    '.psm1',
    '.psd1',
    '.bat',
    '.cmd'
  ]
  if (scriptExtensions.includes(lowerExt)) return 'script'

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
    '.sqlite3'
  ]
  if (binaryExtensions.includes(lowerExt)) return 'binary'

  return 'other'
}

function getMimeType(ext: string): string | void {
  const mimeTypes: Record<string, string> = {
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
    '.sql': 'application/sql',
    '.xml': 'application/xml',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.toml': 'text/toml',
    '.csv': 'text/csv',
    '.graphql': 'application/graphql',
    '.txt': 'text/plain',
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.html': 'text/html',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.bmp': 'image/bmp'
  }
  return mimeTypes[ext.toLowerCase()]
}

export class SkillInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('SkillInputPlugin')
  }

  readMcpConfig(
    skillDir: string,
    fs: typeof import('node:fs'),
    logger: ILogger
  ): SkillMcpConfig | void {
    const mcpJsonPath = path.join(skillDir, 'mcp.json')

    if (!fs.existsSync(mcpJsonPath)) return void 0

    if (!fs.statSync(mcpJsonPath).isFile()) {
      logger.warn('mcp.json is not a file', {skillDir})
      return void 0
    }

    try {
      const rawContent = fs.readFileSync(mcpJsonPath, 'utf8')
      const parsed = JSON.parse(rawContent) as {mcpServers?: Record<string, McpServerConfig>}

      if (parsed.mcpServers == null || typeof parsed.mcpServers !== 'object') {
        logger.warn('mcp.json missing mcpServers field', {skillDir})
        return void 0
      }

      return {
        type: PromptKind.SkillMcpConfig,
        mcpServers: parsed.mcpServers,
        rawContent
      }
    }
    catch (e) {
      logger.warn('failed to parse mcp.json', {skillDir, error: e})
      return void 0
    }
  }

  scanSkillDirectory(
    skillDir: string,
    fs: typeof import('node:fs'),
    logger: ILogger,
    currentRelativePath: string = ''
  ): {childDocs: SkillChildDoc[], resources: SkillResource[]} {
    const childDocs: SkillChildDoc[] = []
    const resources: SkillResource[] = []

    const currentDir = currentRelativePath
      ? path.join(skillDir, currentRelativePath)
      : skillDir

    try {
      const entries = fs.readdirSync(currentDir, {withFileTypes: true})

      for (const entry of entries) {
        const relativePath = currentRelativePath
          ? `${currentRelativePath}/${entry.name}`
          : entry.name

        if (entry.isDirectory()) {
          const subResult = this.scanSkillDirectory(skillDir, fs, logger, relativePath)
          childDocs.push(...subResult.childDocs)
          resources.push(...subResult.resources)
        } else if (entry.isFile()) {
          const filePath = path.join(currentDir, entry.name)

          if (entry.name.endsWith('.mdx')) {
            if (currentRelativePath === '' && entry.name === 'skill.mdx') continue

            try {
              const rawContent = fs.readFileSync(filePath, 'utf8')
              const parsed = parseMarkdown(rawContent)
              const content = transformMdxReferencesToMd(parsed.contentWithoutFrontMatter)

              childDocs.push({
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
                  basePath: skillDir,
                  getDirectoryName: () => path.dirname(relativePath),
                  getAbsolutePath: () => filePath
                }
              } as SkillChildDoc)
            }
            catch (e) {
              logger.warn('failed to read child doc', {path: relativePath, error: e})
            }
          } else {
            if (currentRelativePath === '' && entry.name === 'mcp.json') continue

            const ext = path.extname(entry.name)
            let content: string,
              encoding: SkillResourceEncoding,
              length: number

            try {
              if (isBinaryResourceExtension(ext)) {
                const buffer = fs.readFileSync(filePath)
                content = buffer.toString('base64')
                encoding = 'base64'
                ;({length} = buffer)
              } else {
                content = fs.readFileSync(filePath, 'utf8')
                encoding = 'text'
                ;({length} = Buffer.from(content, 'utf8'))
              }

              const mimeType = getMimeType(ext)
              const resource: SkillResource = {
                type: PromptKind.SkillResource,
                extension: ext,
                fileName: entry.name,
                relativePath,
                content,
                encoding,
                category: getResourceCategory(ext),
                length
              }

              if (mimeType != null) resources.push({...resource, mimeType})
              else resources.push(resource)
            }
            catch (e) {
              logger.warn('failed to read resource file', {path: relativePath, error: e})
            }
          }
        }
      }
    }
    catch (e) {
      logger.warn('failed to scan directory', {path: currentDir, error: e})
    }

    return {childDocs, resources}
  }

  async collect(ctx: InputPluginContext): Promise<Partial<CollectedInputContext>> {
    const {userConfigOptions: options, logger, globalScope} = ctx
    const {shadowProjectDir} = this.resolveBasePaths(options)

    const skillDir = this.resolveShadowPath(options.shadowSourceProject.skill.dist, shadowProjectDir)

    const skills: SkillPrompt[] = []
    if (!(ctx.fs.existsSync(skillDir) && ctx.fs.statSync(skillDir).isDirectory())) return {skills}

    const entries = ctx.fs.readdirSync(skillDir, {withFileTypes: true})
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillFilePath = ctx.path.join(skillDir, entry.name, 'skill.mdx')
        if (ctx.fs.existsSync(skillFilePath) && ctx.fs.statSync(skillFilePath).isFile()) {
          try {
            const rawContent = ctx.fs.readFileSync(skillFilePath, 'utf8')

            const parsed = parseMarkdown<SkillYAMLFrontMatter>(rawContent)

            const compileResult = await mdxToMd(rawContent, {
              globalScope,
              extractMetadata: true,
              basePath: ctx.path.join(skillDir, entry.name)
            })

            const mergedFrontMatter: SkillYAMLFrontMatter = {
              ...parsed.yamlFrontMatter,
              ...compileResult.metadata.fields
            } as SkillYAMLFrontMatter

            const validationResult = validateSkillMetadata(
              mergedFrontMatter as Record<string, unknown>,
              skillFilePath
            )

            for (const warning of validationResult.warnings) logger.debug(warning)

            if (!validationResult.valid) throw new MetadataValidationError(validationResult.errors, skillFilePath)

            const content = transformMdxReferencesToMd(compileResult.content)

            const skillAbsoluteDir = ctx.path.join(skillDir, entry.name)

            const mcpConfig = this.readMcpConfig(skillAbsoluteDir, ctx.fs, logger)

            const {childDocs, resources} = this.scanSkillDirectory(
              skillAbsoluteDir,
              ctx.fs,
              logger
            )

            logger.debug('skill metadata extracted', {
              skill: entry.name,
              source: compileResult.metadata.source,
              hasYaml: parsed.yamlFrontMatter != null,
              hasExport: Object.keys(compileResult.metadata.fields).length > 0
            })

            const {seriName} = mergedFrontMatter

            skills.push({
              type: PromptKind.Skill,
              content,
              length: content.length,
              filePathKind: FilePathKind.Relative,
              yamlFrontMatter: mergedFrontMatter.name != null
                ? mergedFrontMatter
                : {name: entry.name, description: ''} as SkillYAMLFrontMatter,
              ...parsed.rawFrontMatter != null && {rawFrontMatter: parsed.rawFrontMatter},
              markdownAst: parsed.markdownAst,
              markdownContents: parsed.markdownContents,
              ...mcpConfig != null && {mcpConfig},
              ...childDocs.length > 0 && {childDocs},
              ...resources.length > 0 && {resources},
              ...seriName != null && {seriName},
              dir: {
                pathKind: FilePathKind.Relative,
                path: entry.name,
                basePath: skillDir,
                getDirectoryName: () => entry.name,
                getAbsolutePath: () => path.join(skillDir, entry.name)
              }
            })
          }
          catch (e) {
            logger.error('failed to parse skill', {file: skillFilePath, error: e})
          }
        }
      }
    }
    return {skills}
  }
}
