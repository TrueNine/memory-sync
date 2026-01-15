import type {CollectedInputContext, InputPluginContext, SubAgentPrompt, SubAgentYAMLFrontMatter} from '@/types'

import {mdxToMd} from '@/compiler'
import {parseMarkdown} from '@/markdown'
import {
  FilePathKind,
  MetadataValidationError,
  PromptKind,
  validateSubAgentMetadata,
} from '@/types'
import {AbstractInputPlugin} from './AbstractInputPlugin'

export class SubAgentInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('SubAgentInputPlugin')
  }

  async collect(ctx: InputPluginContext): Promise<Partial<CollectedInputContext>> {
    const {userConfigOptions: options, logger, fs, path, globalScope} = ctx
    const {workspaceDir, shadowProjectDir} = this.resolveBasePaths(options)

    const subAgentDirRaw = options.shadowSubAgentDir
    const subAgentDir = this.resolvePath(subAgentDirRaw, workspaceDir, shadowProjectDir)

    const subAgents: SubAgentPrompt[] = []
    if (fs.existsSync(subAgentDir) && fs.statSync(subAgentDir).isDirectory()) {
      try {
        const entries = fs.readdirSync(subAgentDir, {withFileTypes: true})
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith('.mdx')) {
            const filePath = path.join(subAgentDir, entry.name)
            const rawContent = fs.readFileSync(filePath, 'utf8')

            const parsed = parseMarkdown<SubAgentYAMLFrontMatter>(rawContent) // Parse YAML front matter first for backward compatibility

            const compileResult = await mdxToMd(rawContent, { // Compile MDX with globalScope and extract metadata from exports
              globalScope,
              extractMetadata: true,
              basePath: subAgentDir,
            })

            const mergedFrontMatter: SubAgentYAMLFrontMatter | undefined = parsed.yamlFrontMatter != null || Object.keys(compileResult.metadata.fields).length > 0 // Merge YAML front matter with export metadata (export takes priority)
              ? {
                  ...parsed.yamlFrontMatter,
                  ...compileResult.metadata.fields,
                } as SubAgentYAMLFrontMatter
              : void 0

            if (mergedFrontMatter != null) { // Validate merged metadata
              const validationResult = validateSubAgentMetadata(mergedFrontMatter as Record<string, unknown>, filePath)

              for (const warning of validationResult.warnings) logger.debug(warning) // Log validation warnings

              if (!validationResult.valid) throw new MetadataValidationError(validationResult.errors, filePath) // Throw error if validation fails (missing required fields)
            }

            const {content} = compileResult // Use compiled content

            logger.debug('sub agent metadata extracted', { // Log metadata source for debugging
              agent: entry.name,
              source: compileResult.metadata.source,
              hasYaml: parsed.yamlFrontMatter != null,
              hasExport: Object.keys(compileResult.metadata.fields).length > 0,
            })

            subAgents.push({
              type: PromptKind.SubAgent,
              content,
              length: content.length,
              filePathKind: FilePathKind.Relative,
              ...mergedFrontMatter != null && {yamlFrontMatter: mergedFrontMatter},
              ...parsed.rawFrontMatter != null && {rawFrontMatter: parsed.rawFrontMatter},
              markdownAst: parsed.markdownAst,
              markdownContents: parsed.markdownContents,
              dir: {
                pathKind: FilePathKind.Relative,
                path: entry.name,
                basePath: subAgentDir,
                getDirectoryName: () => entry.name.replace(/\.mdx$/, ''),
                getAbsolutePath: () => filePath,
              },
            })
          }
        }
      }
      catch (e) {
        logger.error(`Failed to scan sub agents at ${subAgentDir}`, {error: e})
      }
    }

    return {subAgents}
  }
}
