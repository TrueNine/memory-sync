import type {CollectedInputContext, ILogger, InputPluginContext, McpServerConfig, SkillMcpConfig, SkillPrompt, SkillYAMLFrontMatter} from '@truenine/plugin-shared'
import type {Dirent} from 'node:fs'
import type {ResourceScanResult} from './ResourceProcessor'
import * as path from 'node:path'
import {mdxToMd} from '@truenine/md-compiler'
import {MetadataValidationError} from '@truenine/md-compiler/errors'
import {parseMarkdown, transformMdxReferencesToMd} from '@truenine/md-compiler/markdown'
import {AbstractInputPlugin} from '@truenine/plugin-input-shared'
import {FilePathKind, PromptKind, validateSkillMetadata} from '@truenine/plugin-shared'
import {ResourceProcessor} from './ResourceProcessor'

export {
  getResourceCategory,
  isBinaryResourceExtension
} from './config/fileTypes' // Re-export for backward compatibility

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
 * Process skill file and extract metadata
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

/**
 * Check if directory entry is a valid skill
 */
/**
 * Check if directory entry is a valid skill
 */
function isValidSkillDirectory(
  entry: Dirent,
  skillDir: string,
  fs: typeof import('node:fs')
): boolean {
  if (!entry.isDirectory()) return false

  const skillFilePath = path.join(skillDir, entry.name, 'skill.mdx')
  return fs.existsSync(skillFilePath) && fs.statSync(skillFilePath).isFile()
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
    return processor.scanSkillDirectory(skillDir, currentRelativePath) // When called recursively, currentRelativePath is set and we join paths // When called from tests with empty currentRelativePath, we need to use skillDir as currentDir
  }

  async collect(ctx: InputPluginContext): Promise<Partial<CollectedInputContext>> {
    const {userConfigOptions: options, logger} = ctx
    const {shadowProjectDir} = this.resolveBasePaths(options)

    const skillDir = this.resolveShadowPath(options.shadowSourceProject.skill.dist, shadowProjectDir)
    const skills: SkillPrompt[] = []

    if (!(ctx.fs.existsSync(skillDir) && ctx.fs.statSync(skillDir).isDirectory())) { // Early return if skill directory doesn't exist
      return {skills}
    }

    let entries: Dirent[]
    try {
      entries = ctx.fs.readdirSync(skillDir, {withFileTypes: true})
    }
    catch (e) {
      logger.warn('failed to read skill directory', {skillDir, error: e})
      return {skills}
    }

    for (const entry of entries) {
      if (!isValidSkillDirectory(entry, skillDir, ctx.fs)) continue

      const entryName = entry.name
      const skillFilePath = ctx.path.join(skillDir, entryName, 'skill.mdx')
      const skillAbsoluteDir = ctx.path.join(skillDir, entryName)

      try {
        const skill = await processSkillFile(
          skillFilePath,
          skillDir,
          entryName,
          skillAbsoluteDir,
          ctx
        )
        if (skill) skills.push(skill)
      }
      catch (e) {
        logger.error('failed to parse skill', {file: skillFilePath, error: e})
      }
    }

    return {skills}
  }
}
