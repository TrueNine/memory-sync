import type {
  CollectedInputContext,
  ILogger,
  InputPluginContext,
  LocalizedPrompt,
  LocalizedSkillPrompt,
  McpServerConfig,
  SkillMcpConfig,
  SkillPrompt,
  SkillYAMLFrontMatter
} from '@truenine/plugin-shared'
import type {ResourceScanResult} from './ResourceProcessor'
import * as path from 'node:path'
import {mdxToMd} from '@truenine/md-compiler'
import {MetadataValidationError} from '@truenine/md-compiler/errors'
import {parseMarkdown, transformMdxReferencesToMd} from '@truenine/md-compiler/markdown'
import {AbstractInputPlugin, createLocalizedPromptReader} from '@truenine/plugin-input-shared'
import {FilePathKind, PromptKind, validateSkillMetadata} from '@truenine/plugin-shared'
import {ResourceProcessor} from './ResourceProcessor'

export {
  getResourceCategory,
  isBinaryResourceExtension
} from './config/fileTypes'

/**
 * Read MCP configuration from mcp.json file
 */
function readMcpConfig(
  skillDir: string,
  fs: typeof import('node:fs'),
  logger: ILogger
): SkillMcpConfig | undefined {
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

/**
 * Create SkillPrompt from compiled content
 */
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

  const srcFilePath = path.join(skillAbsoluteDir, 'skill.cn.mdx') // Find the source file to get metadata
  let rawContent = content
  let parsed: ReturnType<typeof parseMarkdown<SkillYAMLFrontMatter>> | undefined

  if (fs.existsSync(srcFilePath)) {
    try {
      rawContent = fs.readFileSync(srcFilePath, 'utf8')
      parsed = parseMarkdown<SkillYAMLFrontMatter>(rawContent)

      const compileResult = await mdxToMd(rawContent, { // Re-compile if reading from source
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

  return { // Build result with all optional fields using spread
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
      getAbsolutePath: () => path.join(skillDir, name)
    },
    ...parsed?.rawFrontMatter != null && {rawFrontMatter: parsed.rawFrontMatter},
    ...mcpConfig != null && {mcpConfig},
    ...childDocs != null && childDocs.length > 0 && {childDocs},
    ...resources != null && resources.length > 0 && {resources},
    ...seriName != null && {seriName}
  } as SkillPrompt
}

/**
 * Process skill file and extract metadata (legacy, for backward compatibility)
 */
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
      getAbsolutePath: () => path.join(skillDir, entryName)
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

    const srcSkillDir = this.resolveShadowPath(options.shadowSourceProject.skill.src, shadowProjectDir) // Get both src and dist paths
    const distSkillDir = this.resolveShadowPath(options.shadowSourceProject.skill.dist, shadowProjectDir)

    const legacySkills: SkillPrompt[] = []

    const reader = createLocalizedPromptReader(fs, pathModule, logger, globalScope) // Use LocalizedPromptReader for new architecture

    const {prompts: localizedSkills, errors} = await reader.readDirectoryStructure(
      srcSkillDir,
      distSkillDir,
      {
        kind: PromptKind.Skill,
        entryFileName: 'skill',
        localeExtensions: {zh: '.cn.mdx', en: '.mdx'},
        isDirectoryStructure: true,
        createPrompt: async (content, locale, name) => {
          const skillSrcDir = pathModule.join(srcSkillDir, name) // Get extras from source directory

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

    for (const error of errors) { // Log errors but don't fail
      logger.warn('Failed to read skill', {path: error.path, phase: error.phase, error: error.error})
    }

    for (const localized of localizedSkills) { // Build legacy skills array from localized prompts (for backward compatibility)
      const prompt = localized.dist?.prompt ?? localized.src.default.prompt // Prefer dist content, fallback to src.default

      if (prompt) legacySkills.push(prompt)
    }

    if (fs.existsSync(distSkillDir)) { // Also scan dist directory for skills that might not have src (edge case)
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

    const promptIndex = new Map<string, LocalizedPrompt>() // Build prompt index
    for (const skill of localizedSkills) promptIndex.set(skill.name, skill)

    return {
      prompts: { // New architecture - partial prompts context (other arrays filled by other plugins)
        skills: localizedSkills as LocalizedSkillPrompt[],
        commands: [],
        subAgents: [],
        rules: [],
        readme: []
      },
      promptIndex,

      skills: legacySkills // Legacy (backward compatibility)
    }
  }
}
