import type {Dirent} from 'node:fs'
import type {
  ILogger,
  InputCapabilityContext,
  InputCollectedContext,
  McpServerConfig,
  SkillChildDoc,
  SkillMcpConfig,
  SkillPrompt,
  SkillResource,
  SkillResourceEncoding,
  SkillYAMLFrontMatter
} from '../plugins/plugin-core'
import type {ResourceScanResult} from './input-agentskills-types'

import {Buffer} from 'node:buffer'
import * as nodePath from 'node:path'
import {mdxToMd} from '@truenine/md-compiler'
import {parseMarkdown, transformMdxReferencesToMd} from '@truenine/md-compiler/markdown'
import {
  buildConfigDiagnostic,
  buildDiagnostic,
  buildFileOperationDiagnostic,
  buildPathStateDiagnostic,
  buildPromptCompilerDiagnostic,
  diagnosticLines
} from '@/diagnostics'
import {
  AbstractInputCapability,
  createLocalizedPromptReader,
  FilePathKind,
  hasSourcePromptExtension,
  PromptKind,
  SourceLocaleExtensions,
  validateSkillMetadata
} from '../plugins/plugin-core'
import {assertNoResidualModuleSyntax, MissingCompiledPromptError} from '../plugins/plugin-core/DistPromptGuards'
import {
  formatPromptCompilerDiagnostic,
  resolveSourcePathForDistFile
} from '../plugins/plugin-core/PromptCompilerDiagnostics'

export * from './input-agentskills-types' // Re-export from types file

interface WritableSkillMetadata {
  name?: string
  description?: string
  displayName?: string
  keywords?: string[]
  author?: string
  version?: string
  allowTools?: string[]
  [key: string]: unknown
}

const EXPORT_DEFAULT_REGEX = /export\s+default\s*\{([\s\S]*?)\}/u
const DESCRIPTION_REGEX = /description\s*:\s*['"`]([^'"`]+)['"`]/u
const NAME_REGEX = /name\s*:\s*['"`]([^'"`]+)['"`]/u
const DISPLAY_NAME_REGEX = /displayName\s*:\s*['"`]([^'"`]+)['"`]/u
const KEYWORDS_REGEX = /keywords\s*:\s*\[([^\]]+)\]/u
const AUTHOR_REGEX = /author\s*:\s*['"`]([^'"`]+)['"`]/u
const VERSION_REGEX = /version\s*:\s*['"`]([^'"`]+)['"`]/u

function extractSkillMetadataFromExport(content: string): WritableSkillMetadata {
  const metadata: WritableSkillMetadata = {}

  const exportMatch = EXPORT_DEFAULT_REGEX.exec(content)
  if (exportMatch?.[1] == null) return metadata

  const objectContent = exportMatch[1]

  const descriptionMatch = DESCRIPTION_REGEX.exec(objectContent)
  if (descriptionMatch?.[1] != null) metadata.description = descriptionMatch[1]

  const nameMatch = NAME_REGEX.exec(objectContent)
  if (nameMatch?.[1] != null) metadata.name = nameMatch[1]

  const displayNameMatch = DISPLAY_NAME_REGEX.exec(objectContent)
  if (displayNameMatch?.[1] != null) metadata.displayName = displayNameMatch[1]

  const keywordsMatch = KEYWORDS_REGEX.exec(objectContent)
  if (keywordsMatch?.[1] != null) {
    metadata.keywords = keywordsMatch[1]
      .split(',')
      .map(k => k.trim().replaceAll(/['"]/gu, ''))
      .filter(k => k.length > 0)
  }

  const authorMatch = AUTHOR_REGEX.exec(objectContent)
  if (authorMatch?.[1] != null) metadata.author = authorMatch[1]

  const versionMatch = VERSION_REGEX.exec(objectContent)
  if (versionMatch?.[1] != null) metadata.version = versionMatch[1]

  return metadata
}

function mergeDefinedSkillMetadata(
  ...sources: (Record<string, unknown> | undefined)[]
): WritableSkillMetadata {
  const merged: WritableSkillMetadata = {}

  for (const source of sources) {
    if (source == null) continue

    for (const [key, value] of Object.entries(source)) {
      if (value !== void 0) (merged as Record<string, unknown>)[key] = value
    }
  }

  return merged
}

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
  readonly scanMode: 'distChildDocs' | 'srcResources'
  readonly sourceSkillDir?: string
  readonly globalScope?: InputCapabilityContext['globalScope']
}

class ResourceProcessor {
  private readonly ctx: ResourceProcessorContext

  constructor(ctx: ResourceProcessorContext) {
    this.ctx = ctx
  }

  async processDirectory(entry: Dirent, currentRelativePath: string, filePath: string): Promise<ResourceScanResult> {
    const relativePath = currentRelativePath
      ? `${currentRelativePath}/${entry.name}`
      : entry.name
    return this.scanSkillDirectoryAsync(filePath, relativePath)
  }

  async processFile(entry: Dirent, currentRelativePath: string, filePath: string): Promise<ResourceScanResult> {
    const relativePath = currentRelativePath
      ? `${currentRelativePath}/${entry.name}`
      : entry.name

    if (this.ctx.scanMode === 'distChildDocs') {
      if (currentRelativePath === '' && entry.name === 'skill.mdx') return {childDocs: [], resources: []}
      if (hasSourcePromptExtension(entry.name) || !entry.name.endsWith('.mdx')) return {childDocs: [], resources: []}

      const childDoc = await this.processChildDoc(relativePath, filePath)
      return {childDocs: childDoc ? [childDoc] : [], resources: []}
    }

    if (currentRelativePath === '' && entry.name === 'mcp.json') return {childDocs: [], resources: []}
    if (hasSourcePromptExtension(entry.name) || entry.name.endsWith('.mdx')) return {childDocs: [], resources: []}

    const resource = this.processResourceFile(entry.name, relativePath, filePath)
    return {childDocs: [], resources: resource ? [resource] : []}
  }

  private async processChildDoc(relativePath: string, filePath: string): Promise<SkillChildDoc | null> {
    try {
      const rawContent = this.ctx.fs.readFileSync(filePath, 'utf8')
      const parsed = parseMarkdown(rawContent)
      const compileResult = await mdxToMd(rawContent, {
        globalScope: this.ctx.globalScope,
        extractMetadata: true,
        basePath: nodePath.dirname(filePath),
        filePath
      })
      const compiledContent = transformMdxReferencesToMd(compileResult.content)
      assertNoResidualModuleSyntax(compiledContent, filePath)

      return {
        type: PromptKind.SkillChildDoc,
        content: compiledContent,
        length: compiledContent.length,
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
    catch (error) {
      this.ctx.logger.error(buildPromptCompilerDiagnostic({
        code: 'SKILL_CHILD_DOC_COMPILE_FAILED',
        title: 'Failed to compile skill child doc',
        diagnosticText: formatPromptCompilerDiagnostic(error, {
          operation: 'Failed to compile skill child doc.',
          promptKind: 'skill-child-doc',
          logicalName: `${nodePath.basename(this.ctx.skillDir)}/${relativePath.replace(/\.mdx$/u, '')}`,
          distPath: filePath,
          srcPath: resolveSourcePathForDistFile(nodePath, filePath, {
            distRootDir: this.ctx.skillDir,
            srcRootDir: this.ctx.sourceSkillDir
          })
        }),
        details: {
          skillDir: this.ctx.skillDir,
          relativePath,
          filePath
        }
      }))
      throw error
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
        sourcePath: filePath,
        content,
        encoding,
        length,
        ...mimeType != null && {mimeType}
      }

      return resource
    }
    catch (e) {
      this.ctx.logger.warn(buildFileOperationDiagnostic({
        code: 'SKILL_RESOURCE_READ_FAILED',
        title: 'Failed to read skill resource file',
        operation: 'read',
        targetKind: 'skill resource file',
        path: filePath,
        error: e,
        details: {
          relativePath,
          fileName,
          skillDir: this.ctx.skillDir
        }
      }))
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

  async scanSkillDirectoryAsync(currentDir: string, currentRelativePath: string = ''): Promise<ResourceScanResult> {
    const childDocs: SkillChildDoc[] = []
    const resources: SkillResource[] = []

    let entries: Dirent[]
    try {
      entries = this.ctx.fs.readdirSync(currentDir, {withFileTypes: true})
    }
    catch (e) {
      this.ctx.logger.warn(buildFileOperationDiagnostic({
        code: 'SKILL_DIRECTORY_SCAN_FAILED',
        title: 'Failed to scan skill directory',
        operation: 'scan',
        targetKind: 'skill directory',
        path: currentDir,
        error: e,
        details: {
          skillDir: this.ctx.skillDir,
          scanMode: this.ctx.scanMode
        }
      }))
      return {childDocs, resources}
    }

    for (const entry of entries) {
      const filePath = pathJoin(currentDir, entry.name)

      if (entry.isDirectory()) {
        const subResult = await this.processDirectory(entry, currentRelativePath, filePath)
        childDocs.push(...subResult.childDocs)
        resources.push(...subResult.resources)
        continue
      }

      if (!entry.isFile()) continue

      const fileResult = await this.processFile(entry, currentRelativePath, filePath)
      childDocs.push(...fileResult.childDocs)
      resources.push(...fileResult.resources)
    }

    return {childDocs, resources}
  }
}

function collectExpectedCompiledChildDocPaths(
  skillDir: string,
  fs: typeof import('node:fs'),
  logger: ILogger,
  currentRelativePath: string = ''
): string[] {
  const expectedPaths: string[] = []
  const currentDir = currentRelativePath === ''
    ? skillDir
    : pathJoin(skillDir, currentRelativePath)

  let entries: Dirent[]
  try {
    entries = fs.readdirSync(currentDir, {withFileTypes: true})
  }
  catch (error) {
    logger.warn(buildFileOperationDiagnostic({
      code: 'SKILL_SOURCE_CHILD_SCAN_FAILED',
      title: 'Failed to scan skill source child docs',
      operation: 'scan',
      targetKind: 'skill source child doc directory',
      path: currentDir,
      error
    }))
    return expectedPaths
  }

  for (const entry of entries) {
    const entryRelativePath = currentRelativePath
      ? `${currentRelativePath}/${entry.name}`
      : entry.name

    if (entry.isDirectory()) {
      expectedPaths.push(...collectExpectedCompiledChildDocPaths(skillDir, fs, logger, entryRelativePath))
      continue
    }

    if (!entry.isFile() || !hasSourcePromptExtension(entry.name)) continue
    if (currentRelativePath === '' && entry.name === 'skill.src.mdx') continue

    expectedPaths.push(entryRelativePath.replace(/\.src\.mdx$/u, '.mdx'))
  }

  return expectedPaths
}

function assertCompiledChildDocsExist(
  skillName: string,
  skillSrcDir: string,
  skillDistDir: string,
  fs: typeof import('node:fs'),
  logger: ILogger
): void {
  if (!fs.existsSync(skillSrcDir)) return

  for (const relativePath of collectExpectedCompiledChildDocPaths(skillSrcDir, fs, logger)) {
    const distPath = nodePath.join(skillDistDir, relativePath)
    if (fs.existsSync(distPath)) continue

    throw new MissingCompiledPromptError({
      kind: 'skill child doc',
      name: `${skillName}/${relativePath}`,
      sourcePath: nodePath.join(skillSrcDir, relativePath.replace(/\.mdx$/u, '.src.mdx')),
      expectedDistPath: distPath
    })
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
    logger.warn(buildPathStateDiagnostic({
      code: 'SKILL_MCP_CONFIG_NOT_FILE',
      title: 'Skill MCP config path is not a file',
      path: mcpJsonPath,
      expectedKind: 'mcp.json file',
      actualState: 'path exists but is not a regular file',
      details: {
        skillDir
      }
    }))
    return void 0
  }

  try {
    const rawContent = fs.readFileSync(mcpJsonPath, 'utf8')
    const parsed = JSON.parse(rawContent) as {mcpServers?: Record<string, McpServerConfig>}

    if (parsed.mcpServers == null || typeof parsed.mcpServers !== 'object') {
      logger.warn(buildConfigDiagnostic({
        code: 'SKILL_MCP_CONFIG_INVALID',
        title: 'Skill MCP config is missing mcpServers',
        reason: diagnosticLines(
          `The skill MCP config at "${mcpJsonPath}" does not contain a top-level mcpServers object.`
        ),
        configPath: mcpJsonPath,
        exactFix: diagnosticLines(
          'Add a top-level `mcpServers` object to mcp.json before retrying tnmsc.'
        ),
        details: {
          skillDir
        }
      }))
      return void 0
    }

    return {
      type: PromptKind.SkillMcpConfig,
      mcpServers: parsed.mcpServers,
      rawContent
    }
  }
  catch (e) {
    logger.warn(buildConfigDiagnostic({
      code: 'SKILL_MCP_CONFIG_PARSE_FAILED',
      title: 'Failed to parse skill MCP config',
      reason: diagnosticLines(
        `tnmsc could not parse the MCP config file at "${mcpJsonPath}".`,
        `Underlying error: ${e instanceof Error ? e.message : String(e)}`
      ),
      configPath: mcpJsonPath,
      exactFix: diagnosticLines('Fix the JSON syntax in mcp.json and rerun tnmsc.'),
      details: {
        skillDir,
        errorMessage: e instanceof Error ? e.message : String(e)
      }
    }))
    return void 0
  }
}

async function createSkillPrompt(
  content: string,
  _locale: 'zh' | 'en',
  name: string,
  skillDir: string,
  skillAbsoluteDir: string,
  ctx: InputCapabilityContext,
  mcpConfig?: SkillMcpConfig,
  childDocs: SkillPrompt['childDocs'] = [],
  resources: SkillPrompt['resources'] = [],
  seriName?: string | string[] | null,
  compiledMetadata?: Record<string, unknown>
): Promise<SkillPrompt> {
  const {logger, globalScope, fs} = ctx

  const distFilePath = nodePath.join(skillAbsoluteDir, 'skill.mdx')
  let rawContent = content
  let parsed: ReturnType<typeof parseMarkdown<SkillYAMLFrontMatter>> | undefined,
    distMetadata: Record<string, unknown> | undefined

  if (fs.existsSync(distFilePath)) {
    rawContent = fs.readFileSync(distFilePath, 'utf8')
    parsed = parseMarkdown<SkillYAMLFrontMatter>(rawContent)

    const compileResult = await mdxToMd(rawContent, {
      globalScope,
      extractMetadata: true,
      basePath: skillAbsoluteDir,
      filePath: distFilePath
    })

    content = transformMdxReferencesToMd(compileResult.content)
    assertNoResidualModuleSyntax(content, distFilePath)
    distMetadata = compileResult.metadata.fields
  }

  const exportMetadata = mergeDefinedSkillMetadata(
    extractSkillMetadataFromExport(rawContent),
    compiledMetadata,
    distMetadata
  ) // Merge fallback export parsing with compiled metadata so empty metadata objects do not mask valid fields

  const finalDescription = parsed?.yamlFrontMatter?.description ?? exportMetadata?.description

  if (finalDescription == null || finalDescription.trim().length === 0) { // Strict validation: description must exist and not be empty
    logger.error(buildDiagnostic({
      code: 'SKILL_VALIDATION_FAILED',
      title: 'Skill description is required',
      rootCause: diagnosticLines(
        `The skill "${name}" does not provide a non-empty description in its compiled metadata or front matter.`
      ),
      exactFix: diagnosticLines(
        'Add a non-empty description field to the skill front matter or exported metadata and rebuild the skill.'
      ),
      possibleFixes: [
        diagnosticLines('Set `description` in `SKILL.md` front matter.'),
        diagnosticLines('If you export metadata from code, ensure the exported description is non-empty.')
      ],
      details: {
        skill: name,
        skillDir,
        yamlDescription: parsed?.yamlFrontMatter?.description,
        exportDescription: exportMetadata?.description
      }
    }))
    throw new Error(`Skill "${name}" validation failed: description is required and cannot be empty`)
  }

  const mergedFrontMatter: SkillYAMLFrontMatter = {
    ...exportMetadata,
    ...parsed?.yamlFrontMatter ?? {},
    name,
    description: finalDescription
  } as SkillYAMLFrontMatter

  const validation = validateSkillMetadata(mergedFrontMatter as Record<string, unknown>, distFilePath)
  if (!validation.valid) throw new Error(validation.errors.join('\n'))

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

export class SkillInputCapability extends AbstractInputCapability {
  constructor() {
    super('SkillInputCapability')
  }

  readMcpConfig(
    skillDir: string,
    fs: typeof import('node:fs'),
    logger: ILogger
  ): SkillMcpConfig | undefined {
    return readMcpConfig(skillDir, fs, logger)
  }

  async scanSkillDirectory(
    skillDir: string,
    fs: typeof import('node:fs'),
    logger: ILogger,
    currentRelativePath: string = '',
    scanMode: 'distChildDocs' | 'srcResources' = 'srcResources',
    globalScope?: InputCapabilityContext['globalScope'],
    sourceSkillDir?: string
  ): Promise<ResourceScanResult> {
    const processor = new ResourceProcessor({
      fs,
      logger,
      skillDir,
      scanMode,
      ...globalScope != null && {globalScope},
      ...sourceSkillDir != null && {sourceSkillDir}
    })
    return processor.scanSkillDirectoryAsync(skillDir, currentRelativePath)
  }

  async collect(ctx: InputCapabilityContext): Promise<Partial<InputCollectedContext>> {
    const {userConfigOptions: options, logger, fs, path: pathModule, globalScope} = ctx
    const {aindexDir} = this.resolveBasePaths(options)

    const srcSkillDir = this.resolveAindexPath(options.aindex.skills.src, aindexDir)
    const distSkillDir = this.resolveAindexPath(options.aindex.skills.dist, aindexDir)

    const flatSkills: SkillPrompt[] = []
    const reader = createLocalizedPromptReader(fs, pathModule, logger, globalScope)
    const skillArtifactCache = new Map<string, {
      readonly childDocs: SkillChildDoc[]
      readonly resources: SkillResource[]
      readonly mcpConfig?: SkillMcpConfig
    }>()

    const getSkillArtifacts = async (name: string): Promise<{
      readonly childDocs: SkillChildDoc[]
      readonly resources: SkillResource[]
      readonly mcpConfig?: SkillMcpConfig
    }> => {
      const cached = skillArtifactCache.get(name)
      if (cached != null) return cached

      const skillSrcDir = pathModule.join(srcSkillDir, name)
      const skillDistDir = pathModule.join(distSkillDir, name)

      const childDocs = fs.existsSync(skillDistDir)
        ? (await this.scanSkillDirectory(skillDistDir, fs, logger, '', 'distChildDocs', globalScope, skillSrcDir)).childDocs
        : []
      const resources = fs.existsSync(skillSrcDir)
        ? (await this.scanSkillDirectory(skillSrcDir, fs, logger, '', 'srcResources', globalScope)).resources
        : []
      const mcpConfig = readMcpConfig(skillSrcDir, fs, logger)

      assertCompiledChildDocsExist(name, skillSrcDir, skillDistDir, fs, logger)

      const artifacts = {
        childDocs,
        resources,
        ...mcpConfig != null && {mcpConfig}
      }

      skillArtifactCache.set(name, artifacts)
      return artifacts
    }

    const {prompts: localizedSkills, errors} = await reader.readDirectoryStructure(
      srcSkillDir,
      distSkillDir,
      {
        kind: PromptKind.Skill,
        entryFileName: 'skill',
        localeExtensions: SourceLocaleExtensions,
        isDirectoryStructure: true,
        createPrompt: async (content, locale, name, metadata) => {
          const skillDistDir = pathModule.join(distSkillDir, name)
          const {childDocs, resources, mcpConfig} = await getSkillArtifacts(name)

          return createSkillPrompt(
            content,
            locale,
            name,
            distSkillDir,
            skillDistDir,
            ctx,
            mcpConfig,
            childDocs,
            resources,
            void 0,
            metadata
          )
        }
      }
    )

    for (const error of errors) {
      logger.warn(buildFileOperationDiagnostic({
        code: 'SKILL_PROMPT_READ_FAILED',
        title: 'Failed to read skill prompt',
        operation: error.phase === 'scan' ? 'scan' : 'read',
        targetKind: 'skill prompt',
        path: error.path,
        error: error.error,
        details: {
          phase: error.phase
        }
      }))
    }

    if (errors.length > 0) throw new Error(errors.map(error => error.error instanceof Error ? error.error.message : String(error.error)).join('\n'))

    for (const localized of localizedSkills) {
      const prompt = localized.dist?.prompt
      if (prompt != null) flatSkills.push(prompt)
    }

    return {
      skills: flatSkills
    }
  }
}
