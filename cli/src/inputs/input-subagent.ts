import type {
  InputCapabilityContext,
  InputCollectedContext,
  Locale,
  SubAgentPrompt,
  SubAgentYAMLFrontMatter
} from '../plugins/plugin-core'
import {buildConfigDiagnostic, buildFileOperationDiagnostic, diagnosticLines} from '@/diagnostics'
import {
  AbstractInputCapability,
  createLocalizedPromptReader,
  deriveSubAgentIdentity,
  FilePathKind,
  PromptKind,
  SourceLocaleExtensions,
  validateSubAgentMetadata

} from '../plugins/plugin-core'

export class SubAgentInputCapability extends AbstractInputCapability {
  constructor() {
    super('SubAgentInputCapability')
  }

  private createSubAgentPrompt(
    content: string,
    _locale: Locale,
    name: string,
    srcDir: string,
    distDir: string,
    ctx: InputCapabilityContext,
    metadata?: Record<string, unknown>,
    warnedDerivedNames?: Set<string>
  ): SubAgentPrompt {
    const {fs, logger, path} = ctx
    const {agentPrefix, agentName, canonicalName} = deriveSubAgentIdentity(name)

    const filePath = path.join(distDir, `${name}.mdx`)
    const entryName = `${name}.mdx`
    const sourceFilePath = fs.existsSync(path.join(srcDir, `${name}.src.mdx`))
      ? path.join(srcDir, `${name}.src.mdx`)
      : filePath
    const yamlFrontMatter = metadata == null
      ? void 0
      : (() => {
          const frontMatter = {...metadata}
          const authoredName = frontMatter['name']

          if (typeof authoredName === 'string' && authoredName.trim().length > 0 && warnedDerivedNames?.has(sourceFilePath) !== true) {
            warnedDerivedNames?.add(sourceFilePath)
            logger.warn(buildConfigDiagnostic({
              code: 'SUBAGENT_NAME_IGNORED',
              title: 'Sub-agent authored name is ignored',
              reason: diagnosticLines(
                `tnmsc ignores the authored sub-agent name "${authoredName}" in favor of the derived path name "${canonicalName}".`
              ),
              configPath: sourceFilePath,
              exactFix: diagnosticLines(
                'Remove the `name` field from the sub-agent front matter or exported metadata.',
                'Rename the sub-agent directory or file if you need a different sub-agent name.'
              ),
              details: {
                authoredName,
                derivedName: canonicalName,
                logicalName: name
              }
            }))
          }

          delete frontMatter['name']
          return frontMatter as SubAgentYAMLFrontMatter
        })()

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
      agentName,
      canonicalName
    } as SubAgentPrompt

    if (yamlFrontMatter == null) return prompt

    const validation = validateSubAgentMetadata(yamlFrontMatter as Record<string, unknown>, filePath)
    if (!validation.valid) throw new Error(validation.errors.join('\n'))

    Object.assign(prompt, {yamlFrontMatter})
    if (yamlFrontMatter.seriName != null) Object.assign(prompt, {seriName: yamlFrontMatter.seriName})
    return prompt
  }

  override async collect(ctx: InputCapabilityContext): Promise<Partial<InputCollectedContext>> {
    const {userConfigOptions: options, logger, path, fs, globalScope} = ctx
    const resolvedPaths = this.resolveBasePaths(options)

    const srcDir = this.resolveAindexPath(options.aindex.subAgents.src, resolvedPaths.aindexDir)
    const distDir = this.resolveAindexPath(options.aindex.subAgents.dist, resolvedPaths.aindexDir)

    logger.debug('SubAgentInputCapability collecting', {
      srcDir,
      distDir,
      aindexDir: resolvedPaths.aindexDir
    })

    const reader = createLocalizedPromptReader(fs, path, logger, globalScope)
    const warnedDerivedNames = new Set<string>()

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
          srcDir,
          distDir,
          ctx,
          metadata,
          warnedDerivedNames
        )
      }
    )

    logger.debug('SubAgentInputCapability read complete', {
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

    if (errors.length > 0) throw new Error(errors.map(error => error.error instanceof Error ? error.error.message : String(error.error)).join('\n'))

    const flatSubAgents: SubAgentPrompt[] = []
    for (const localized of localizedSubAgents) {
      const distContent = localized.dist
      if (distContent?.prompt == null) continue

      const {prompt: distPrompt, rawMdx} = distContent
      flatSubAgents.push(rawMdx == null
        ? distPrompt
        : {...distPrompt, rawMdxContent: rawMdx})
    }

    logger.debug('SubAgentInputCapability flattened subAgents', {
      count: flatSubAgents.length,
      agents: flatSubAgents.map(a => a.canonicalName)
    })

    return {
      subAgents: flatSubAgents
    }
  }
}
