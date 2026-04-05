import type {
  InputCapabilityContext,
  InputCollectedContext,
  RulePrompt,
  RuleScope,
  RuleYAMLFrontMatter
} from '../plugins/plugin-core'
import {buildFileOperationDiagnostic} from '@/diagnostics'
import {
  AbstractInputCapability,
  createLocalizedPromptReader,
  FilePathKind,
  PromptKind,
  SourceLocaleExtensions,
  validateRuleMetadata
} from '../plugins/plugin-core'

export class RuleInputCapability extends AbstractInputCapability {
  constructor() {
    super('RuleInputCapability')
  }

  override async collect(ctx: InputCapabilityContext): Promise<Partial<InputCollectedContext>> {
    const {userConfigOptions: options, logger, path, fs, globalScope} = ctx
    const resolvedPaths = this.resolveBasePaths(options)

    const srcDir = this.resolveAindexPath(options.aindex.rules.src, resolvedPaths.aindexDir)
    const distDir = this.resolveAindexPath(options.aindex.rules.dist, resolvedPaths.aindexDir)

    const reader = createLocalizedPromptReader(fs, path, logger, globalScope)

    const {prompts: localizedRulesFromSrc, errors} = await reader.readFlatFiles(
      srcDir,
      distDir,
      {
        kind: PromptKind.Rule,
        localeExtensions: SourceLocaleExtensions,
        hydrateSourceContents: false,
        isDirectoryStructure: false,
        createPrompt: async (content, _locale, name, metadata) => {
          const yamlFrontMatter = metadata as RuleYAMLFrontMatter | undefined
          const filePath = path.join(distDir, `${name}.mdx`)
          if (yamlFrontMatter != null) {
            const validation = validateRuleMetadata(yamlFrontMatter as Record<string, unknown>, filePath)
            if (!validation.valid) throw new Error(validation.errors.join('\n'))
          }
          const globs = yamlFrontMatter?.globs ?? []
          const scope: RuleScope = yamlFrontMatter?.scope ?? 'project'
          const seriName = yamlFrontMatter?.seriName as string | undefined
          const normalizedName = name.replaceAll('\\', '/') // Normalize path separator for cross-platform compatibility
          const prefix = normalizedName.includes('/') ? normalizedName.split('/')[0] ?? '' : ''
          const ruleName = normalizedName.split('/').pop() ?? normalizedName

          const rulePrompt = {
            type: PromptKind.Rule,
            content,
            length: content.length,
            filePathKind: FilePathKind.Relative,
            dir: {
              pathKind: FilePathKind.Relative,
              path: `${name}.mdx`,
              basePath: distDir,
              getDirectoryName: () => ruleName,
              getAbsolutePath: () => filePath
            },
            prefix,
            ruleName,
            globs,
            scope,
            markdownContents: []
          } as RulePrompt

          if (yamlFrontMatter != null) Object.assign(rulePrompt, {yamlFrontMatter})
          if (seriName != null) Object.assign(rulePrompt, {seriName})

          return rulePrompt
        }
      }
    )

    for (const error of errors) {
      logger.warn(buildFileOperationDiagnostic({
        code: 'RULE_PROMPT_READ_FAILED',
        title: 'Failed to read rule prompt',
        operation: error.phase === 'scan' ? 'scan' : 'read',
        targetKind: 'rule prompt',
        path: error.path,
        error: error.error,
        details: {
          phase: error.phase
        }
      }))
    }

    if (errors.length > 0) throw new Error(errors.map(error => error.error.message).join('\n'))

    return {
      rules: localizedRulesFromSrc
        .map(r => r.dist?.prompt)
        .filter((rule): rule is RulePrompt => rule != null)
    }
  }
}
