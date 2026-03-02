import type {
  CollectedInputContext,
  ILogger,
  InputPluginContext,
  LocalizedPrompt,
  LocalizedSkillPrompt,
  McpServerConfig,
  SkillChildDoc,
  SkillMcpConfig,
  SkillPrompt,
  SkillResource,
  SkillResourceEncoding,
  SkillYAMLFrontMatter
} from '@truenine/plugin-shared'
import type {Dirent} from 'node:fs'
import type {ResourceScanResult} from './input-agentskills-types'

import {Buffer} from 'node:buffer'
import * as nodePath from 'node:path'
import {mdxToMd} from '@truenine/md-compiler'
import {MetadataValidationError} from '@truenine/md-compiler/errors'
import {parseMarkdown, transformMdxReferencesToMd} from '@truenine/md-compiler/markdown'
import {AbstractInputPlugin, createLocalizedPromptReader} from '@truenine/plugin-input-shared'
import {FilePathKind, PromptKind, validateSkillMetadata} from '@truenine/plugin-shared'

export * from './input-agentskills-types' // Re-export from types file

const MIME_TYPES: Record<string, string> = { // MIME types for resources
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

const SKILL_RESOURCE_BINARY_EXTENSIONS = new Set([ // Binary extensions
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.tiff',
  '.svg',
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
  '.pdf',
  '.docx',
  '.doc',
  '.xlsx',
  '.xls',
  '.pptx',
  '.ppt',
  '.odt',
  '.ods',
  '.odp'
])

type ResourceCategory = 'image' | 'code' | 'data' | 'document' | 'config' | 'script' | 'binary' | 'other'

const FILE_TYPE_CATEGORIES: Record<string, readonly string[]> = {
  image: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp', '.tiff', '.svg'],
  code: ['.kt', '.java', '.py', '.pyi', '.pyx', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.go', '.rs', '.c', '.cpp', '.cc', '.h', '.hpp', '.hxx', '.cs', '.fs', '.fsx', '.vb', '.rb', '.php', '.swift', '.scala', '.groovy', '.lua', '.r', '.jl', '.ex', '.exs', '.erl', '.clj', '.cljs', '.hs', '.ml', '.mli', '.nim', '.zig', '.v', '.dart', '.vue', '.svelte', '.d.ts', '.d.mts', '.d.cts'],
  data: ['.sql', '.json', '.jsonc', '.json5', '.xml', '.xsd', '.xsl', '.xslt', '.yaml', '.yml', '.toml', '.csv', '.tsv', '.graphql', '.gql', '.proto'],
  document: ['.txt', '.text', '.rtf', '.log', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.pdf', '.odt', '.ods', '.odp'],
  config: ['.ini', '.conf', '.cfg', '.config', '.properties', '.env', '.envrc', '.editorconfig', '.gitignore', '.gitattributes', '.npmrc', '.nvmrc', '.npmignore', '.eslintrc', '.prettierrc', '.stylelintrc', '.babelrc', '.browserslistrc'],
  script: ['.sh', '.bash', '.zsh', '.fish', '.ps1', '.psm1', '.psd1', '.bat', '.cmd'],
  binary: ['.exe', '.dll', '.so', '.dylib', '.bin', '.wasm', '.class', '.jar', '.war', '.pyd', '.pyc', '.pyo', '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar', '.ttf', '.otf', '.woff', '.woff2', '.eot', '.db', '.sqlite', '.sqlite3']
}

function getResourceCategory(ext: string): ResourceCategory {
  const lowerExt = ext.toLowerCase()
  for (const [category, extensions] of Object.entries(FILE_TYPE_CATEGORIES)) {
    if (extensions.includes(lowerExt)) return category as ResourceCategory
  }
  return 'other'
}

function isBinaryResourceExtension(ext: string): boolean {
  return SKILL_RESOURCE_BINARY_EXTENSIONS.has(ext.toLowerCase())
}

function getMimeType(ext: string): string | undefined {
  return MIME_TYPES[ext.toLowerCase()]
}

function pathJoin(...segments: string[]): string {
  const joined = nodePath.join(...segments)
  return joined.replaceAll('\\', '/')
}

interface ResourceProcessorContext {
  readonly fs: typeof import('node:fs')
  readonly logger: ILogger
  readonly skillDir: string
}

class ResourceProcessor {
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

    if (currentRelativePath === '' && entry.name === 'skill.mdx') return {childDocs: [], resources: []}

    if (currentRelativePath === '' && entry.name === 'mcp.json') return {childDocs: [], resources: []}

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

function readMcpConfig(
  skillDir: string,
  fs: typeof import('node:fs'),
  logger: ILogger
): SkillMcpConfig | undefined {
  const mcpJsonPath = nodePath.join(skillDir, 'mcp.json')

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

async function createSkillPrompt(
  content: string,
  _locale: 'zh' | 'en',
  name: string,
  skillDir: string,
  skillAbsoluteDir: string,
  ctx: InputPluginContext,
  mcpConfig?: SkillMcpConfig,
  childDocs: SkillPrompt['childDocs'] = [],
  resources: SkillPrompt['resources'] = [],
  seriName?: string | string[] | null
): Promise<SkillPrompt> {
  const {logger, globalScope, fs} = ctx

  const srcFilePath = nodePath.join(skillAbsoluteDir, 'skill.cn.mdx')
  let rawContent = content
  let parsed: ReturnType<typeof parseMarkdown<SkillYAMLFrontMatter>> | undefined

  if (fs.existsSync(srcFilePath)) {
    try {
      rawContent = fs.readFileSync(srcFilePath, 'utf8')
      parsed = parseMarkdown<SkillYAMLFrontMatter>(rawContent)

      const compileResult = await mdxToMd(rawContent, {
        globalScope,
        extractMetadata: true,
        basePath: skillAbsoluteDir
      })

      content = transformMdxReferencesToMd(compileResult.content)
    }
    catch (e) {
      logger.warn('failed to recompile skill from source', {skill: name, error: e})
    }
  }

  const mergedFrontMatter: SkillYAMLFrontMatter = {
    ...parsed?.yamlFrontMatter ?? {},
    name,
    description: ''
  } as SkillYAMLFrontMatter

  return {
    type: PromptKind.Skill,
    content,
    length: content.length,
    filePathKind: FilePathKind.Relative,
    yamlFrontMatter: mergedFrontMatter,
    markdownAst: parsed?.markdownAst,
    markdownContents: parsed?.markdownContents ?? [],
    dir: {
      pathKind: FilePathKind.Relative,
      path: name,
      basePath: skillDir,
      getDirectoryName: () => name,
      getAbsolutePath: () => nodePath.join(skillDir, name)
    },
    ...parsed?.rawFrontMatter != null && {rawFrontMatter: parsed.rawFrontMatter},
    ...mcpConfig != null && {mcpConfig},
    ...childDocs != null && childDocs.length > 0 && {childDocs},
    ...resources != null && resources.length > 0 && {resources},
    ...seriName != null && {seriName}
  } as SkillPrompt
}

async function processSkillFile(
  skillFilePath: string,
  skillDir: string,
  entryName: string,
  skillAbsoluteDir: string,
  ctx: InputPluginContext
): Promise<SkillPrompt | null> {
  const {logger, globalScope, fs} = ctx

  let rawContent: string
  try {
    rawContent = fs.readFileSync(skillFilePath, 'utf8')
  }
  catch (e) {
    logger.error('failed to read skill file', {file: skillFilePath, error: e})
    return null
  }

  let parsed: ReturnType<typeof parseMarkdown<SkillYAMLFrontMatter>>
  try {
    parsed = parseMarkdown<SkillYAMLFrontMatter>(rawContent)
  }
  catch (e) {
    logger.error('failed to parse skill markdown', {file: skillFilePath, error: e})
    return null
  }

  let compileResult: Awaited<ReturnType<typeof mdxToMd>>
  try {
    compileResult = await mdxToMd(rawContent, {
      globalScope,
      extractMetadata: true,
      basePath: skillAbsoluteDir
    })
  }
  catch (e) {
    logger.error('failed to compile skill mdx', {file: skillFilePath, error: e})
    return null
  }

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

  logger.debug('skill metadata extracted', {
    skill: entryName,
    source: compileResult.metadata.source,
    hasYaml: parsed.yamlFrontMatter != null,
    hasExport: Object.keys(compileResult.metadata.fields).length > 0
  })

  const processor = new ResourceProcessor({fs, logger, skillDir: skillAbsoluteDir})
  const {childDocs, resources} = processor.scanSkillDirectory(skillAbsoluteDir)
  const mcpConfig = readMcpConfig(skillAbsoluteDir, fs, logger)

  const {seriName} = mergedFrontMatter

  return {
    type: PromptKind.Skill,
    content,
    length: content.length,
    filePathKind: FilePathKind.Relative,
    yamlFrontMatter: mergedFrontMatter.name != null
      ? mergedFrontMatter
      : {name: entryName, description: ''} as SkillYAMLFrontMatter,
    ...parsed.rawFrontMatter != null && {rawFrontMatter: parsed.rawFrontMatter},
    markdownAst: parsed.markdownAst,
    markdownContents: parsed.markdownContents,
    ...mcpConfig != null && {mcpConfig},
    ...childDocs.length > 0 && {childDocs},
    ...resources.length > 0 && {resources},
    ...seriName != null && {seriName},
    dir: {
      pathKind: FilePathKind.Relative,
      path: entryName,
      basePath: skillDir,
      getDirectoryName: () => entryName,
      getAbsolutePath: () => nodePath.join(skillDir, entryName)
    }
  }
}

export class SkillInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('SkillInputPlugin')
  }

  readMcpConfig(
    skillDir: string,
    fs: typeof import('node:fs'),
    logger: ILogger
  ): SkillMcpConfig | undefined {
    return readMcpConfig(skillDir, fs, logger)
  }

  scanSkillDirectory(
    skillDir: string,
    fs: typeof import('node:fs'),
    logger: ILogger,
    currentRelativePath: string = ''
  ): ResourceScanResult {
    const processor = new ResourceProcessor({fs, logger, skillDir})
    return processor.scanSkillDirectory(skillDir, currentRelativePath)
  }

  async collect(ctx: InputPluginContext): Promise<Partial<CollectedInputContext>> {
    const {userConfigOptions: options, logger, fs, path: pathModule, globalScope} = ctx
    const {shadowProjectDir} = this.resolveBasePaths(options)

    const srcSkillDir = this.resolveShadowPath(options.shadowSourceProject.skill.src, shadowProjectDir)
    const distSkillDir = this.resolveShadowPath(options.shadowSourceProject.skill.dist, shadowProjectDir)

    const legacySkills: SkillPrompt[] = []
    const reader = createLocalizedPromptReader(fs, pathModule, logger, globalScope)

    const {prompts: localizedSkills, errors} = await reader.readDirectoryStructure(
      srcSkillDir,
      distSkillDir,
      {
        kind: PromptKind.Skill,
        entryFileName: 'skill',
        localeExtensions: {zh: '.cn.mdx', en: '.mdx'},
        isDirectoryStructure: true,
        createPrompt: async (content, locale, name) => {
          const skillSrcDir = pathModule.join(srcSkillDir, name)
          const processor = new ResourceProcessor({fs, logger, skillDir: skillSrcDir})
          const {childDocs, resources} = processor.scanSkillDirectory(skillSrcDir)
          const mcpConfig = readMcpConfig(skillSrcDir, fs, logger)

          return createSkillPrompt(
            content,
            locale,
            name,
            distSkillDir,
            skillSrcDir,
            ctx,
            mcpConfig,
            childDocs,
            resources
          )
        }
      }
    )

    for (const error of errors) logger.warn('Failed to read skill', {path: error.path, phase: error.phase, error: error.error})

    for (const localized of localizedSkills) {
      const prompt = localized.dist?.prompt ?? localized.src.default.prompt
      if (prompt) legacySkills.push(prompt)
    }

    if (fs.existsSync(distSkillDir)) {
      const distEntries = fs.readdirSync(distSkillDir, {withFileTypes: true})
      const existingNames = new Set(localizedSkills.map(s => s.name))

      for (const entry of distEntries) {
        if (!entry.isDirectory()) continue
        if (existingNames.has(entry.name)) continue

        const entryName = entry.name
        const skillFilePath = pathModule.join(distSkillDir, entryName, 'skill.mdx')
        const skillAbsoluteDir = pathModule.join(distSkillDir, entryName)

        if (!fs.existsSync(skillFilePath)) continue

        try {
          const skill = await processSkillFile(
            skillFilePath,
            distSkillDir,
            entryName,
            skillAbsoluteDir,
            ctx
          )
          if (skill) legacySkills.push(skill)
        }
        catch (e) {
          logger.error('failed to parse skill', {file: skillFilePath, error: e})
        }
      }
    }

    const promptIndex = new Map<string, LocalizedPrompt>()
    for (const skill of localizedSkills) promptIndex.set(skill.name, skill)

    return {
      prompts: {
        skills: localizedSkills as LocalizedSkillPrompt[],
        commands: [],
        subAgents: [],
        rules: [],
        readme: []
      },
      promptIndex,
      skills: legacySkills
    }
  }
}
