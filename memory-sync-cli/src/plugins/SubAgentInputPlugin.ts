import type {ParsedMarkdown} from '@/markdown'
import type {
  CollectedInputContext,
  MetadataValidationResult,
  PluginOptions,
  ResolvedBasePaths,
  SubAgentPrompt,
  SubAgentYAMLFrontMatter
} from '@/types'
import {
  FilePathKind,
  PromptKind,
  validateSubAgentMetadata
} from '@/types'
import {BaseDirectoryInputPlugin} from './BaseDirectoryInputPlugin'

export class SubAgentInputPlugin extends BaseDirectoryInputPlugin<SubAgentPrompt, SubAgentYAMLFrontMatter> {
  constructor() {
    super('SubAgentInputPlugin', {configKey: 'shadowSubAgentDir'})
  }

  protected getTargetDir(options: Required<PluginOptions>, resolvedPaths: ResolvedBasePaths): string {
    const raw = options.shadowSubAgentDir
    const {workspaceDir, shadowProjectDir} = resolvedPaths
    return this.resolvePath(raw, workspaceDir, shadowProjectDir)
  }

  protected validateMetadata(metadata: Record<string, unknown>, filePath: string): MetadataValidationResult {
    return validateSubAgentMetadata(metadata, filePath)
  }

  protected createResult(items: SubAgentPrompt[]): Partial<CollectedInputContext> {
    return {subAgents: items}
  }

  protected createPrompt(
    entryName: string,
    filePath: string,
    content: string,
    yamlFrontMatter: SubAgentYAMLFrontMatter | undefined,
    rawFrontMatter: string | undefined,
    parsed: ParsedMarkdown<SubAgentYAMLFrontMatter>,
    baseDir: string,
    _rawContent: string
  ): SubAgentPrompt {
    return {
      type: PromptKind.SubAgent,
      content,
      length: content.length,
      filePathKind: FilePathKind.Relative,
      ...yamlFrontMatter != null && {yamlFrontMatter},
      ...rawFrontMatter != null && {rawFrontMatter},
      markdownAst: parsed.markdownAst,
      markdownContents: parsed.markdownContents,
      dir: {
        pathKind: FilePathKind.Relative,
        path: entryName,
        basePath: baseDir,
        getDirectoryName: () => entryName.replace(/\.mdx$/, ''),
        getAbsolutePath: () => filePath
      }
    }
  }
}
