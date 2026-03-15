import type {
  InputCollectedContext,
  InputPluginContext,
  RulePrompt,
  RuleScope,
  RuleYAMLFrontMatter
} from '../plugins/plugin-core'
import {
  AbstractInputPlugin,
  createLocalizedPromptReader,
  FilePathKind,
  PromptKind,
  SourceLocaleExtensions
} from '../plugins/plugin-core'

export class RuleInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('RuleInputPlugin')
  }

  override async collect(ctx: InputPluginContext): Promise<Partial<InputCollectedContext>> {
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
        isDirectoryStructure: false,
        createPrompt: async (content, _locale, name, metadata) => {
          const yamlFrontMatter = metadata as RuleYAMLFrontMatter | undefined
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
              getAbsolutePath: () => path.join(distDir, `${name}.mdx`)
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

    for (const error of errors) logger.warn('Failed to read rule', {path: error.path, phase: error.phase, error: error.error})

    return {
      rules: localizedRulesFromSrc
        .map(r => r.dist?.prompt)
        .filter((rule): rule is RulePrompt => rule != null)
    }
  }
}
