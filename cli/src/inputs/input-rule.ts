import type {
  InputCollectedContext,
  InputPluginContext,
  RulePrompt,
  RuleScope
} from '../plugins/plugin-core'
import {mdxToMd} from '@truenine/md-compiler'
import {
  AbstractInputPlugin,
  createLocalizedPromptReader,
  FilePathKind,
  PromptKind

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
        localeExtensions: {zh: '.cn.mdx', en: '.mdx'},
        isDirectoryStructure: false,
        createPrompt: async (content, _locale, name, _metadata) => {
          const distFilePath = path.join(distDir, `${name}.mdx`)
          let globs: readonly string[] = []
          let scope: RuleScope = 'project'
          let seriName: string | undefined,
            yamlFrontMatter: Record<string, unknown> | undefined

          try {
            const rawContent = fs.readFileSync(distFilePath, 'utf8')
            const {metadata} = await mdxToMd(rawContent, { // Use mdxToMd to extract metadata from export default syntax
              globalScope,
              extractMetadata: true,
              basePath: distDir
            })
            if (metadata?.fields != null) {
              yamlFrontMatter = metadata.fields
              globs = (metadata.fields['globs'] as string[]) ?? []
              scope = (metadata.fields['scope'] as RuleScope) ?? 'project'
              seriName = metadata.fields['seriName'] as string | undefined
            }
          }
          catch { /* Ignore errors */ }

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

    for (const error of errors) logger.warn('Failed to read rule from src', {path: error.path, phase: error.phase, error: error.error})

    return {
      rules: localizedRulesFromSrc.map(r => r.src.default.prompt!).filter(Boolean)
    }
  }
}
