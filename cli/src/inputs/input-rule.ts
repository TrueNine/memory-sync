import type {
  CollectedInputContext,
  InputPluginContext,
  LocalizedRulePrompt,
  PluginOptions,
  ResolvedBasePaths,
  RulePrompt,
  RuleScope
} from '@truenine/plugin-shared'
import {mdxToMd} from '@truenine/md-compiler'
import {parseMarkdown} from '@truenine/md-compiler/markdown'
import {
  AbstractInputPlugin,
  createLocalizedPromptReader
} from '@truenine/plugin-input-shared'
import {
  FilePathKind,
  PromptKind
} from '@truenine/plugin-shared'

export class RuleInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('RuleInputPlugin')
  }

  private getDistDir(options: Required<PluginOptions>, resolvedPaths: ResolvedBasePaths): string {
    return this.resolveAindexPath(options.aindex.rule.dist, resolvedPaths.aindexDir)
  }

  private getSrcDir(options: Required<PluginOptions>, resolvedPaths: ResolvedBasePaths): string {
    return this.resolveAindexPath(options.aindex.rule.src, resolvedPaths.aindexDir)
  }

  override async collect(ctx: InputPluginContext): Promise<Partial<CollectedInputContext>> {
    const {userConfigOptions: options, logger, path, fs, globalScope} = ctx
    const resolvedPaths = this.resolveBasePaths(options)

    const srcDir = this.getSrcDir(options, resolvedPaths)
    const distDir = this.getDistDir(options, resolvedPaths)

    const reader = createLocalizedPromptReader(fs, path, logger, globalScope)

    const {prompts: localizedRulesFromSrc, errors} = await reader.readFlatFiles(
      srcDir,
      distDir,
      {
        kind: PromptKind.Rule,
        localeExtensions: {zh: '.cn.mdx', en: '.mdx'},
        isDirectoryStructure: false,
        createPrompt: async (content, _locale, name) => {
          const distFilePath = path.join(distDir, `${name}.mdx`)
          let globs: readonly string[] = []
          let scope: RuleScope = 'project'
          let seriName: string | undefined,
            yamlFrontMatter: Record<string, unknown> | undefined,
            rawFrontMatter: string | undefined

          try {
            const rawContent = fs.readFileSync(distFilePath, 'utf8')
            const {yamlFrontMatter: yfm, rawFrontMatter: rfm} = parseMarkdown(rawContent)
            if (yfm) {
              yamlFrontMatter = yfm
              rawFrontMatter = rfm
              globs = (yfm['globs'] as string[]) ?? []
              scope = (yfm['scope'] as RuleScope) ?? 'project'
              seriName = yfm['seriName'] as string | undefined
            }
          }
          catch { /* Ignore errors */ }

          const rulePrompt = {
            type: PromptKind.Rule,
            content,
            length: content.length,
            filePathKind: FilePathKind.Relative,
            dir: {
              pathKind: FilePathKind.Relative,
              path: `${name}.mdx`,
              basePath: distDir,
              getDirectoryName: () => name.split('/').pop() ?? name,
              getAbsolutePath: () => path.join(distDir, `${name}.mdx`)
            },
            series: name.includes('/') ? name.split('/')[0] ?? '' : '',
            ruleName: name.split('/').pop() ?? name,
            globs,
            scope,
            markdownContents: []
          } as RulePrompt

          if (yamlFrontMatter != null) Object.assign(rulePrompt, {yamlFrontMatter})
          if (rawFrontMatter != null) Object.assign(rulePrompt, {rawFrontMatter})
          if (seriName != null) Object.assign(rulePrompt, {seriName})

          return rulePrompt
        }
      }
    )

    const legacyRules: RulePrompt[] = []
    const localizedRules: LocalizedRulePrompt[] = [...localizedRulesFromSrc]

    if (fs.existsSync(distDir)) {
      try {
        const entries = fs.readdirSync(distDir, {withFileTypes: true})

        for (const entry of entries) {
          if (!entry.isDirectory()) continue

          const seriesName = entry.name
          const seriesDir = path.join(distDir, seriesName)

          const alreadyProcessed = localizedRulesFromSrc.some(r => r.name.startsWith(`${seriesName}/`))
          if (alreadyProcessed) continue

          try {
            const files = fs.readdirSync(seriesDir, {withFileTypes: true})

            for (const file of files) {
              if (!file.isFile() || !file.name.endsWith('.mdx')) continue

              const baseName = file.name.slice(0, -'.mdx'.length)
              const name = `${seriesName}/${baseName}`
              const distFilePath = path.join(seriesDir, file.name)

              if (localizedRulesFromSrc.some(r => r.name === name)) continue

              try {
                const rawContent = fs.readFileSync(distFilePath, 'utf8')
                const parsed = parseMarkdown(rawContent)

                const content = globalScope != null ? await mdxToMd(rawContent, {globalScope, basePath: seriesDir}) : parsed.contentWithoutFrontMatter ?? rawContent

                const {yamlFrontMatter} = parsed
                const globs = (yamlFrontMatter?.['globs'] as string[]) ?? []
                const scope = (yamlFrontMatter?.['scope'] as RuleScope) ?? 'project'
                const seriName = yamlFrontMatter?.['seriName'] as string | undefined

                const rulePrompt = {
                  type: PromptKind.Rule,
                  content,
                  length: content.length,
                  filePathKind: FilePathKind.Relative,
                  dir: {
                    pathKind: FilePathKind.Relative,
                    path: `${name}.mdx`,
                    basePath: distDir,
                    getDirectoryName: () => baseName,
                    getAbsolutePath: () => distFilePath
                  },
                  series: seriesName,
                  ruleName: baseName,
                  globs,
                  scope,
                  markdownContents: []
                } as RulePrompt

                if (yamlFrontMatter != null) Object.assign(rulePrompt, {yamlFrontMatter})
                if (parsed.rawFrontMatter != null) Object.assign(rulePrompt, {rawFrontMatter: parsed.rawFrontMatter})
                if (seriName != null) Object.assign(rulePrompt, {seriName})

                legacyRules.push(rulePrompt)

                const localizedPrompt: LocalizedRulePrompt = {
                  name,
                  type: PromptKind.Rule,
                  src: {
                    zh: {
                      content,
                      lastModified: fs.statSync(distFilePath).mtime,
                      prompt: rulePrompt,
                      filePath: distFilePath
                    },
                    default: {
                      content,
                      lastModified: fs.statSync(distFilePath).mtime,
                      prompt: rulePrompt,
                      filePath: distFilePath
                    },
                    defaultLocale: 'zh'
                  },
                  dist: {
                    content,
                    lastModified: fs.statSync(distFilePath).mtime,
                    prompt: rulePrompt,
                    filePath: distFilePath
                  },
                  metadata: {
                    hasDist: true,
                    hasMultipleLocales: false,
                    isDirectoryStructure: true
                  },
                  paths: {
                    dist: distFilePath
                  }
                }

                localizedRules.push(localizedPrompt)
              } catch (error) {
                logger.warn('Failed to process rule from dist', {path: distFilePath, error})
              }
            }
          } catch (error) {
            logger.warn('Failed to scan series directory', {path: seriesDir, error})
          }
        }
      } catch (error) {
        logger.warn('Failed to scan dist directory', {path: distDir, error})
      }
    }

    for (const error of errors) logger.warn('Failed to read rule from src', {path: error.path, phase: error.phase, error: error.error})

    const promptIndex = new Map<string, LocalizedRulePrompt>()
    for (const rule of localizedRules) promptIndex.set(rule.name, rule)

    return {
      prompts: {
        skills: [],
        commands: [],
        subAgents: [],
        rules: localizedRules,
        readme: []
      },
      promptIndex,
      rules: [...localizedRulesFromSrc.map(r => r.src.default.prompt!).filter(Boolean), ...legacyRules]
    }
  }
}
