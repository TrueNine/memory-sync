import type {ILogger} from '@/log'
import type {
  CollectedInputContext,
  InputPluginContext,
  McpServerConfig,
  SkillChildDoc,
  SkillMcpConfig,
  SkillPrompt,
  SkillResource,
  SkillResourceEncoding,
  SkillYAMLFrontMatter
} from '@/types'

import {Buffer} from 'node:buffer'
import * as path from 'node:path'
import {mdxToMd} from '@truenine/md-compiler'
import {MetadataValidationError} from '@truenine/md-compiler/errors'
import {parseMarkdown, transformMdxReferencesToMd} from '@truenine/md-compiler/markdown'
import {
  FilePathKind,
  PromptKind,
  validateSkillMetadata
} from '@/types'
import {getMimeType, getResourceCategory, isBinaryResourceExtension} from '@/utils/ResourceUtils'
import {AbstractInputPlugin} from './AbstractInputPlugin'

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
          const subResult = this.scanSkillDirectory(skillDir, fs, logger, relativePath) // Recursively scan subdirectories
          childDocs.push(...subResult.childDocs)
          resources.push(...subResult.resources)
        } else if (entry.isFile()) {
          const filePath = path.join(currentDir, entry.name)

          if (entry.name.endsWith('.mdx')) { // Handle .mdx files as child docs (except skill.mdx at root)
            if (currentRelativePath === '' && entry.name === 'skill.mdx') continue // Skip skill.mdx at root level

            try {
              const rawContent = fs.readFileSync(filePath, 'utf8')
              const parsed = parseMarkdown(rawContent)
              const content = transformMdxReferencesToMd(parsed.contentWithoutFrontMatter) // Transform .mdx references to .md in child doc content

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
            if (currentRelativePath === '' && entry.name === 'mcp.json') continue // Handle non-.mdx files as resources (except mcp.json at root)

            const ext = path.extname(entry.name)
            let content: string,
              encoding: SkillResourceEncoding,
              length: number

            try {
              if (isBinaryResourceExtension(ext)) {
                const buffer = fs.readFileSync(filePath) // Read as binary and encode to base64
                content = buffer.toString('base64')
                encoding = 'base64'
                ; ({length} = buffer)
              } else {
                content = fs.readFileSync(filePath, 'utf8') // Read as UTF-8 text (default for unknown extensions too)
                encoding = 'text'
                ; ({length} = Buffer.from(content, 'utf8'))
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

            const parsed = parseMarkdown<SkillYAMLFrontMatter>(rawContent) // Parse YAML front matter first for backward compatibility

            const compileResult = await mdxToMd(rawContent, { // Compile MDX with globalScope and extract metadata from exports
              globalScope,
              extractMetadata: true,
              basePath: ctx.path.join(skillDir, entry.name)
            })

            const mergedFrontMatter: SkillYAMLFrontMatter = { // Merge YAML front matter with export metadata (export takes priority)
              ...parsed.yamlFrontMatter,
              ...compileResult.metadata.fields
            } as SkillYAMLFrontMatter

            const validationResult = validateSkillMetadata( // Validate merged metadata
              mergedFrontMatter as Record<string, unknown>,
              skillFilePath
            )

            for (const warning of validationResult.warnings) logger.debug(warning) // Log validation warnings

            if (!validationResult.valid) throw new MetadataValidationError(validationResult.errors, skillFilePath) // Throw error if validation fails (missing required fields)

            const content = transformMdxReferencesToMd(compileResult.content) // Use compiled content and transform .mdx references to .md

            const skillAbsoluteDir = ctx.path.join(skillDir, entry.name)

            const mcpConfig = this.readMcpConfig(skillAbsoluteDir, ctx.fs, logger) // Read MCP configuration (mcp.json)

            const {childDocs, resources} = this.scanSkillDirectory( // Recursively scan for child docs and resources
              skillAbsoluteDir,
              ctx.fs,
              logger
            )

            logger.debug('skill metadata extracted', { // Log metadata source for debugging
              skill: entry.name,
              source: compileResult.metadata.source,
              hasYaml: parsed.yamlFrontMatter != null,
              hasExport: Object.keys(compileResult.metadata.fields).length > 0
            })

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
              ...mcpConfig != null && {mcpConfig}, // Include MCP configuration if found
              ...childDocs.length > 0 && {childDocs}, // Include child docs if any were found
              ...resources.length > 0 && {resources}, // Include resources if any were found
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
