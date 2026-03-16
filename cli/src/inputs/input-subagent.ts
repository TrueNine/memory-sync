import type {
  InputCollectedContext,
  InputPluginContext,
  Locale,
  SubAgentPrompt,
  SubAgentYAMLFrontMatter
} from '../plugins/plugin-core'
import {buildFileOperationDiagnostic} from '@/diagnostics'
import {
  AbstractInputPlugin,
  createLocalizedPromptReader,
  FilePathKind,
  PromptKind,
  SourceLocaleExtensions

} from '../plugins/plugin-core'

export class SubAgentInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('SubAgentInputPlugin')
  }

  private createSubAgentPrompt(
    content: string,
    _locale: Locale,
    name: string,
    distDir: string,
    ctx: InputPluginContext,
    metadata?: Record<string, unknown>
  ): SubAgentPrompt {
    const {path} = ctx

    const normalizedName = name.replaceAll('\\', '/') // Normalize Windows backslashes to forward slashes
    const slashIndex = normalizedName.indexOf('/')
    const parentDirName = slashIndex !== -1 ? normalizedName.slice(0, slashIndex) : void 0
    const fileName = slashIndex !== -1 ? normalizedName.slice(slashIndex + 1) : normalizedName

    const baseName = fileName.replace(/\.mdx$/, '')
    const underscoreIndex = baseName.indexOf('_')
    const agentPrefix = parentDirName ?? (underscoreIndex === -1 ? void 0 : baseName.slice(0, Math.max(0, underscoreIndex)))
    const agentName = parentDirName != null || underscoreIndex === -1
      ? baseName
      : baseName.slice(Math.max(0, underscoreIndex + 1))

    const filePath = path.join(distDir, `${name}.mdx`)
    const entryName = `${name}.mdx`
    const yamlFrontMatter = metadata as SubAgentYAMLFrontMatter | undefined

    const prompt: SubAgentPrompt = {
      type: PromptKind.SubAgent,
      content,
      length: content.length,
      filePathKind: FilePathKind.Relative,
      dir: {
        pathKind: FilePathKind.Relative,
        path: entryName,
        basePath: distDir,
        getDirectoryName: () => entryName.replace(/\.mdx$/, ''),
        getAbsolutePath: () => filePath
      },
      ...agentPrefix != null && {agentPrefix},
      agentName
    } as SubAgentPrompt

    if (yamlFrontMatter == null) return prompt

    Object.assign(prompt, {yamlFrontMatter})
    if (yamlFrontMatter.seriName != null) Object.assign(prompt, {seriName: yamlFrontMatter.seriName})
    return prompt
  }

  override async collect(ctx: InputPluginContext): Promise<Partial<InputCollectedContext>> {
    const {userConfigOptions: options, logger, path, fs, globalScope} = ctx
    const resolvedPaths = this.resolveBasePaths(options)

    const srcDir = this.resolveAindexPath(options.aindex.subAgents.src, resolvedPaths.aindexDir)
    const distDir = this.resolveAindexPath(options.aindex.subAgents.dist, resolvedPaths.aindexDir)

    logger.debug('SubAgentInputPlugin collecting', {
      srcDir,
      distDir,
      aindexDir: resolvedPaths.aindexDir
    })

    const reader = createLocalizedPromptReader(fs, path, logger, globalScope)

    const {prompts: localizedSubAgents, errors} = await reader.readFlatFiles(
      srcDir,
      distDir,
      {
        kind: PromptKind.SubAgent,
        localeExtensions: SourceLocaleExtensions,
        isDirectoryStructure: false,
        createPrompt: (content, locale, name, metadata) => this.createSubAgentPrompt(
          content,
          locale,
          name,
          distDir,
          ctx,
          metadata
        )
      }
    )

    logger.debug('SubAgentInputPlugin read complete', {
      subAgentCount: localizedSubAgents.length,
      errorCount: errors.length
    })

    for (const error of errors) {
      logger.warn(buildFileOperationDiagnostic({
        code: 'SUBAGENT_PROMPT_READ_FAILED',
        title: 'Failed to read sub-agent prompt',
        operation: error.phase === 'scan' ? 'scan' : 'read',
        targetKind: 'sub-agent prompt',
        path: error.path,
        error: error.error,
        details: {
          phase: error.phase
        }
      }))
    }

    const flatSubAgents: SubAgentPrompt[] = []
    for (const localized of localizedSubAgents) {
      const distContent = localized.dist
      if (distContent?.prompt == null) continue

      const {prompt: distPrompt, rawMdx} = distContent
      flatSubAgents.push(rawMdx == null
        ? distPrompt
        : {...distPrompt, rawMdxContent: rawMdx})
    }

    logger.debug('SubAgentInputPlugin flattened subAgents', {
      count: flatSubAgents.length,
      agents: flatSubAgents.map(a => a.agentName)
    })

    return {
      subAgents: flatSubAgents
    }
  }
}
