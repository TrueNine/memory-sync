import type {PromptCompilerDiagnosticContext} from './PromptCompilerDiagnostics'
import type {
  DirectoryReadResult,
  ILogger,
  Locale,
  LocalizedContent,
  LocalizedFileExtension,
  LocalizedPrompt,
  LocalizedReadOptions,
  LoggerDiagnosticInput,
  Prompt,
  PromptKind,
  ReadError
} from './types'
import type {MdxGlobalScope} from '@/md-compiler/globals'
import {
  buildDiagnostic,
  buildFileOperationDiagnostic,
  buildPromptCompilerDiagnostic,
  diagnosticLines
} from '@/diagnostics'
import {
  assertNoResidualModuleSyntax,
  MissingCompiledPromptError,
  ResidualModuleSyntaxError
} from './DistPromptGuards'
import {readPromptArtifact} from './PromptArtifactCache'
import {
  formatPromptCompilerDiagnostic,
  resolveSourcePathForDistFile
} from './PromptCompilerDiagnostics'

function shouldFailFast(error: unknown): boolean {
  return error instanceof MissingCompiledPromptError || error instanceof ResidualModuleSyntaxError
}

interface ReaderDiagnosticContext {
  readonly promptKind: string
  readonly logicalName: string
  readonly entryDistPath: string
  readonly srcPath?: string
}

/**
 * Universal reader for localized prompts
 * Handles reading src (multiple locales) and dist (compiled) content
 * Supports directory structures (skills) and flat files (commands, subAgents)
 *
 * Dist is the only prompt source that may flow into final outputs.
 * Source files are read only for discovery, locale metadata, and validation.
 */
export class LocalizedPromptReader {
  constructor(
    private fs: typeof import('node:fs'),
    private path: typeof import('node:path'),
    private logger: ILogger,
    private globalScope?: MdxGlobalScope
  ) {}

  async readDirectoryStructure<
    T extends Prompt,
    K extends PromptKind
  >(
    srcDir: string,
    distDir: string,
    options: LocalizedReadOptions<T, K>
  ): Promise<DirectoryReadResult<T, K>> {
    const prompts: LocalizedPrompt<T, K>[] = []
    const errors: ReadError[] = []

    if (!this.exists(srcDir)) return {prompts, errors}

    try {
      const entries = this.fs.readdirSync(srcDir, {withFileTypes: true})

      for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const {name} = entry
        const srcEntryDir = this.path.join(srcDir, name)
        const distEntryDir = this.path.join(distDir, name)

        try {
          const localized = await this.readEntry(
            name,
            srcEntryDir,
            distEntryDir,
            options,
            true
          )

          if (localized) prompts.push(localized)
        } catch (error) {
          errors.push({
            path: srcEntryDir,
            error: error as Error,
            phase: 'read'
          })
          this.logger.error(buildFileOperationDiagnostic({
            code: 'LOCALIZED_PROMPT_ENTRY_READ_FAILED',
            title: 'Failed to read localized prompt entry',
            operation: 'read',
            targetKind: `${String(options.kind)} prompt entry`,
            path: srcEntryDir,
            error,
            details: {
              entryName: name,
              promptKind: String(options.kind)
            }
          }))
          if (shouldFailFast(error)) throw error
        }
      }
    } catch (error) {
      errors.push({
        path: srcDir,
        error: error as Error,
        phase: 'scan'
      })
      this.logger.error(buildFileOperationDiagnostic({
        code: 'LOCALIZED_PROMPT_DIRECTORY_SCAN_FAILED',
        title: 'Failed to scan localized prompt source directory',
        operation: 'scan',
        targetKind: `${String(options.kind)} prompt source directory`,
        path: srcDir,
        error,
        details: {
          promptKind: String(options.kind)
        }
      }))
      if (shouldFailFast(error)) throw error
    }

    return {prompts, errors}
  }

  async readFlatFiles<
    T extends Prompt,
    K extends PromptKind
  >(
    srcDir: string,
    distDir: string,
    options: LocalizedReadOptions<T, K>
  ): Promise<DirectoryReadResult<T, K>> {
    const prompts: LocalizedPrompt<T, K>[] = []
    const errors: ReadError[] = []

    const srcExists = this.exists(srcDir)
    const distExists = this.exists(distDir)

    this.logger.debug(`readFlatFiles: srcDir=${srcDir}, exists=${srcExists}`)
    this.logger.debug(`readFlatFiles: distDir=${distDir}, exists=${distExists}`)

    if (!srcExists && !distExists) return {prompts, errors}

    const zhExtensions = this.normalizeExtensions(options.localeExtensions.zh)
    const seenNames = new Set<string>()

    const readPrompt = async (fullName: string, filePath: string): Promise<void> => {
      if (seenNames.has(fullName)) return
      seenNames.add(fullName)

      try {
        const localized = await this.readFlatEntry(
          fullName,
          srcDir,
          distDir,
          fullName,
          options
        )

        if (localized) prompts.push(localized)
      } catch (error) {
        errors.push({
          path: filePath,
          error: error as Error,
          phase: 'read'
        })
        this.logger.error(buildFileOperationDiagnostic({
          code: 'LOCALIZED_PROMPT_FILE_READ_FAILED',
          title: 'Failed to read localized prompt file',
          operation: 'read',
          targetKind: `${String(options.kind)} prompt file`,
          path: filePath,
          error,
          details: {
            promptKind: String(options.kind),
            logicalName: fullName
          }
        }))
        if (shouldFailFast(error)) throw error
      }
    }

    const scanSourceDirectory = async (currentSrcDir: string, relativePath: string = ''): Promise<void> => {
      if (!this.exists(currentSrcDir)) return

      try {
        const entries = this.fs.readdirSync(currentSrcDir, {withFileTypes: true})
        for (const entry of entries) {
          const entryRelativePath = relativePath
            ? this.path.join(relativePath, entry.name)
            : entry.name

          if (entry.isDirectory()) {
            await scanSourceDirectory(this.path.join(currentSrcDir, entry.name), entryRelativePath)
            continue
          }

          const matchedExtension = this.findMatchingExtension(entry.name, zhExtensions)
          if (!entry.isFile() || matchedExtension == null) continue

          const baseName = entry.name.slice(0, -matchedExtension.length)
          const fullName = relativePath
            ? this.path.join(relativePath, baseName)
            : baseName

          await readPrompt(fullName, this.path.join(currentSrcDir, entry.name))
        }
      } catch (error) {
        errors.push({
          path: currentSrcDir,
          error: error as Error,
          phase: 'scan'
        })
        this.logger.error(buildFileOperationDiagnostic({
          code: 'LOCALIZED_SOURCE_DIRECTORY_SCAN_FAILED',
          title: 'Failed to scan localized source directory',
          operation: 'scan',
          targetKind: `${String(options.kind)} source directory`,
          path: currentSrcDir,
          error,
          details: {
            promptKind: String(options.kind)
          }
        }))
        if (shouldFailFast(error)) throw error
      }
    }

    const scanDistDirectory = async (currentDistDir: string, relativePath: string = ''): Promise<void> => {
      if (!this.exists(currentDistDir)) return

      try {
        const entries = this.fs.readdirSync(currentDistDir, {withFileTypes: true})
        for (const entry of entries) {
          const entryRelativePath = relativePath
            ? this.path.join(relativePath, entry.name)
            : entry.name

          if (entry.isDirectory()) {
            await scanDistDirectory(this.path.join(currentDistDir, entry.name), entryRelativePath)
            continue
          }

          if (!entry.isFile() || !entry.name.endsWith('.mdx')) continue

          const baseName = entry.name.slice(0, -'.mdx'.length)
          const fullName = relativePath
            ? this.path.join(relativePath, baseName)
            : baseName

          await readPrompt(fullName, this.path.join(currentDistDir, entry.name))
        }
      } catch (error) {
        errors.push({
          path: currentDistDir,
          error: error as Error,
          phase: 'scan'
        })
        this.logger.error(buildFileOperationDiagnostic({
          code: 'LOCALIZED_DIST_DIRECTORY_SCAN_FAILED',
          title: 'Failed to scan localized dist directory',
          operation: 'scan',
          targetKind: `${String(options.kind)} dist directory`,
          path: currentDistDir,
          error,
          details: {
            promptKind: String(options.kind)
          }
        }))
        if (shouldFailFast(error)) throw error
      }
    }

    if (srcExists) await scanSourceDirectory(srcDir)
    if (distExists) await scanDistDirectory(distDir)

    return {prompts, errors}
  }

  async readSingleFile<
    T extends Prompt,
    K extends PromptKind
  >(
    srcBasePath: string, // Path without extension
    distBasePath: string,
    options: LocalizedReadOptions<T, K>
  ): Promise<LocalizedPrompt<T, K> | null> {
    const name = this.path.basename(srcBasePath)

    return this.readFlatEntry(name, this.path.dirname(srcBasePath), this.path.dirname(distBasePath), srcBasePath, options, true)
  }

  private async readEntry<
    T extends Prompt,
    K extends PromptKind
  >(
    name: string,
    srcEntryDir: string,
    distEntryDir: string,
    options: LocalizedReadOptions<T, K>,
    isDirectoryStructure = true
  ): Promise<LocalizedPrompt<T, K> | null> {
    const {localeExtensions, entryFileName, createPrompt, kind} = options
    const hydrateSourceContents = options.hydrateSourceContents ?? true

    const baseFileName = entryFileName ?? name
    const zhExtensions = this.normalizeExtensions(localeExtensions.zh)
    const enExtensions = this.normalizeExtensions(localeExtensions.en)
    const srcZhPath = this.resolveLocalizedPath(srcEntryDir, baseFileName, zhExtensions)
    const srcEnPath = this.resolveLocalizedPath(srcEntryDir, baseFileName, enExtensions)
    const distPath = this.path.join(distEntryDir, `${baseFileName}.mdx`)
    const hasSourceZh = this.exists(srcZhPath)
    const hasSourceEn = this.exists(srcEnPath)
    const existingSourcePath = hasSourceZh
      ? srcZhPath
      : hasSourceEn
        ? srcEnPath
        : void 0
    const diagnosticContext: ReaderDiagnosticContext = {
      promptKind: String(kind),
      logicalName: name,
      entryDistPath: distPath,
      ...existingSourcePath != null && {srcPath: existingSourcePath}
    }

    const distContent = await this.readDistContent(distPath, createPrompt, name, diagnosticContext)
    const zhContent = hasSourceZh && hydrateSourceContents
      ? await this.readLocaleContent(srcZhPath, 'zh', createPrompt, name, String(kind))
      : null
    const enContent = hasSourceEn && hydrateSourceContents
      ? await this.readLocaleContent(srcEnPath, 'en', createPrompt, name, String(kind))
      : null

    const hasDist = distContent != null
    const sourcePath = hasSourceZh ? srcZhPath : hasSourceEn ? srcEnPath : void 0

    if (!hasDist && !hasSourceZh && !hasSourceEn) {
      this.logger.warn(buildDiagnostic({
        code: 'LOCALIZED_PROMPT_ARTIFACTS_MISSING',
        title: `Missing source and dist prompt artifacts for ${name}`,
        rootCause: diagnosticLines(
          `tnmsc could not find either the source prompt or the compiled dist prompt for "${name}".`
        ),
        exactFix: diagnosticLines(
          'Create the source prompt and rebuild the compiled dist prompt before retrying tnmsc.'
        ),
        details: {
          promptKind: String(kind),
          name,
          srcZhPath,
          srcEnPath,
          distPath
        }
      }))
      return null
    }

    if (!hasDist) {
      throw new MissingCompiledPromptError({
        kind: String(kind),
        name,
        ...sourcePath != null && {sourcePath},
        expectedDistPath: distPath
      })
    }

    const src: LocalizedPrompt<T, K>['src'] = hydrateSourceContents && zhContent != null
      ? {
          zh: zhContent,
          ...enContent != null && {en: enContent},
          default: zhContent,
          defaultLocale: 'zh'
        }
      : void 0

    const children = isDirectoryStructure
      ? this.scanChildren(distEntryDir, baseFileName, ['.mdx'])
      : void 0

    return {
      name,
      type: kind,
      ...src != null && {src},
      ...hasDist && {dist: distContent},
      metadata: {
        hasDist,
        hasMultipleLocales: hasSourceEn,
        isDirectoryStructure,
        ...children && children.length > 0 && {children}
      },
      paths: {
        ...hasSourceZh && {zh: srcZhPath},
        ...hasSourceEn && {en: srcEnPath},
        ...hasDist && {dist: distPath}
      }
    }
  }

  private async readFlatEntry<
    T extends Prompt,
    K extends PromptKind
  >(
    name: string,
    srcDir: string,
    distDir: string,
    baseName: string,
    options: LocalizedReadOptions<T, K>,
    isSingleFile = false
  ): Promise<LocalizedPrompt<T, K> | null> {
    const {localeExtensions, createPrompt, kind} = options
    const hydrateSourceContents = options.hydrateSourceContents ?? true

    const zhExtensions = this.normalizeExtensions(localeExtensions.zh)
    const enExtensions = this.normalizeExtensions(localeExtensions.en)
    const srcZhPath = this.resolveLocalizedPath('', baseName, zhExtensions)
    const srcEnPath = this.resolveLocalizedPath('', baseName, enExtensions)
    const distPath = this.path.join(distDir, `${name}.mdx`)

    const fullSrcZhPath = isSingleFile ? srcZhPath : this.path.join(srcDir, srcZhPath)
    const fullSrcEnPath = isSingleFile ? srcEnPath : this.path.join(srcDir, srcEnPath)
    const hasSourceZh = this.exists(fullSrcZhPath)
    const hasSourceEn = this.exists(fullSrcEnPath)
    const existingSourcePath = hasSourceZh
      ? fullSrcZhPath
      : hasSourceEn
        ? fullSrcEnPath
        : void 0
    const diagnosticContext: ReaderDiagnosticContext = {
      promptKind: String(kind),
      logicalName: name,
      entryDistPath: distPath,
      ...existingSourcePath != null && {srcPath: existingSourcePath}
    }

    const distContent = await this.readDistContent(distPath, createPrompt, name, diagnosticContext)
    const zhContent = hasSourceZh && hydrateSourceContents
      ? await this.readLocaleContent(fullSrcZhPath, 'zh', createPrompt, name, String(kind))
      : null
    const enContent = hasSourceEn && hydrateSourceContents
      ? await this.readLocaleContent(fullSrcEnPath, 'en', createPrompt, name, String(kind))
      : null

    const hasDist = distContent != null
    const sourcePath = hasSourceZh ? fullSrcZhPath : hasSourceEn ? fullSrcEnPath : void 0

    if (!hasDist && !hasSourceZh && !hasSourceEn) {
      this.logger.warn(buildDiagnostic({
        code: 'LOCALIZED_PROMPT_ARTIFACTS_MISSING',
        title: `Missing source and dist prompt artifacts for ${name}`,
        rootCause: diagnosticLines(
          `tnmsc could not find either the source prompt or the compiled dist prompt for "${name}".`
        ),
        exactFix: diagnosticLines(
          'Create the source prompt and rebuild the compiled dist prompt before retrying tnmsc.'
        ),
        details: {
          promptKind: String(kind),
          name,
          srcZhPath: fullSrcZhPath,
          srcEnPath: fullSrcEnPath,
          distPath
        }
      }))
      return null
    }

    if (!hasDist) {
      throw new MissingCompiledPromptError({
        kind: String(kind),
        name,
        ...sourcePath != null && {sourcePath},
        expectedDistPath: distPath
      })
    }

    const src: LocalizedPrompt<T, K>['src'] = hydrateSourceContents && zhContent != null
      ? {
          zh: zhContent,
          ...enContent != null && {en: enContent},
          default: zhContent,
          defaultLocale: 'zh'
        }
      : void 0

    return {
      name,
      type: kind,
      ...src != null && {src},
      ...hasDist && {dist: distContent},
      metadata: {
        hasDist,
        hasMultipleLocales: hasSourceEn,
        isDirectoryStructure: false
      },
      paths: {
        ...hasSourceZh && {zh: fullSrcZhPath},
        ...hasSourceEn && {en: fullSrcEnPath},
        ...hasDist && {dist: distPath}
      }
    }
  }

  private async readLocaleContent<T extends Prompt>(
    filePath: string,
    locale: Locale,
    createPrompt: (content: string, locale: Locale, name: string, metadata?: Record<string, unknown>) => T | Promise<T>,
    name: string,
    promptKind: string
  ): Promise<LocalizedContent<T> | null> {
    if (!this.exists(filePath)) return null

    try {
      const artifact = await readPromptArtifact(filePath, {
        mode: 'source',
        globalScope: this.globalScope
      })
      assertNoResidualModuleSyntax(artifact.content, filePath)

      const prompt = await createPrompt(artifact.content, locale, name, artifact.metadata)

      const result: LocalizedContent<T> = {
        content: artifact.content,
        lastModified: artifact.lastModified,
        filePath
      }

      if (artifact.rawMdx.length > 0) {
        Object.assign(result, {rawMdx: artifact.rawMdx})
      }
      if (artifact.parsed.yamlFrontMatter != null) Object.assign(result, {frontMatter: artifact.parsed.yamlFrontMatter})
      if (prompt != null) Object.assign(result, {prompt})

      return result
    } catch (error) {
      this.logger.error(buildPromptCompilerDiagnostic({
        code: 'LOCALIZED_SOURCE_PROMPT_READ_FAILED',
        title: 'Failed to read localized source prompt',
        diagnosticText: formatPromptCompilerDiagnostic(error, {
          operation: 'Failed to read localized source prompt.',
          promptKind,
          logicalName: name,
          distPath: filePath
        }),
        details: {
          promptKind,
          locale,
          filePath
        }
      }))
      throw error
    }
  }

  private async readDistContent<T extends Prompt>(
    filePath: string,
    createPrompt: (content: string, locale: Locale, name: string, metadata?: Record<string, unknown>) => T | Promise<T>,
    name: string,
    diagnosticContext: ReaderDiagnosticContext
  ): Promise<LocalizedContent<T> | null> {
    if (!this.exists(filePath)) return null

    try {
      const artifact = await readPromptArtifact(filePath, {
        mode: 'dist',
        globalScope: this.globalScope
      })
      assertNoResidualModuleSyntax(artifact.content, filePath)

      const prompt = await createPrompt(
        artifact.content,
        'zh',
        name,
        artifact.metadata
      )

      const result: LocalizedContent<T> = {
        content: artifact.content,
        lastModified: artifact.lastModified,
        prompt,
        filePath,
        rawMdx: artifact.rawMdx
      }

      if (artifact.parsed.yamlFrontMatter != null) Object.assign(result, {frontMatter: artifact.parsed.yamlFrontMatter})
      return result
    } catch (error) {
      this.logger.error(this.buildDistReadDiagnostic(error, filePath, diagnosticContext))
      throw error
    }
  }

  private buildDistReadDiagnostic(
    error: unknown,
    filePath: string,
    context: ReaderDiagnosticContext
  ): LoggerDiagnosticInput {
    const mappedSourcePath = resolveSourcePathForDistFile(this.path, filePath, {
      preferredSourcePath: filePath === context.entryDistPath ? context.srcPath : void 0,
      distRootDir: this.path.dirname(context.entryDistPath),
      srcRootDir: context.srcPath != null ? this.path.dirname(context.srcPath) : void 0
    })
    const formattedContext: PromptCompilerDiagnosticContext = {
      operation: 'Failed to read dist content.',
      promptKind: context.promptKind,
      logicalName: context.logicalName,
      entryDistPath: context.entryDistPath,
      distPath: filePath,
      srcPath: mappedSourcePath
    }
    return buildPromptCompilerDiagnostic({
      code: 'LOCALIZED_DIST_PROMPT_READ_FAILED',
      title: 'Failed to read localized dist prompt',
      diagnosticText: formatPromptCompilerDiagnostic(error, formattedContext),
      details: {
        promptKind: context.promptKind,
        logicalName: context.logicalName,
        filePath,
        srcPath: mappedSourcePath
      }
    })
  }

  private scanChildren(
    dir: string,
    entryFileName: string,
    zhExtensions: readonly string[]
  ): string[] {
    const children: string[] = []

    if (!this.exists(dir)) return children

    const entryFullNames = new Set(zhExtensions.map(extension => `${entryFileName}${extension}`))

    try {
      const scanDir = (currentDir: string, relativePath: string): void => {
        const entries = this.fs.readdirSync(currentDir, {withFileTypes: true})

        for (const entry of entries) {
          const fullPath = this.path.join(currentDir, entry.name)
          const relativeFullPath = relativePath
            ? this.path.join(relativePath, entry.name)
            : entry.name

          if (entry.isDirectory()) scanDir(fullPath, relativeFullPath)
          else {
            const matchedExtension = this.findMatchingExtension(entry.name, zhExtensions)
            if (matchedExtension == null || entryFullNames.has(entry.name)) continue

            const nameWithoutExt = entry.name.slice(0, -matchedExtension.length) // Child doc: relative path without extension
            const relativeDir = this.path.dirname(relativeFullPath)
            const childPath = relativeDir === '.'
              ? nameWithoutExt
              : this.path.join(relativeDir, nameWithoutExt)
            children.push(childPath)
          }
        }
      }

      scanDir(dir, '')
    } catch (error) {
      this.logger.warn(buildFileOperationDiagnostic({
        code: 'LOCALIZED_PROMPT_CHILD_SCAN_FAILED',
        title: 'Failed to scan localized prompt child documents',
        operation: 'scan',
        targetKind: 'localized prompt child directory',
        path: dir,
        error
      }))
    }

    return children
  }

  private exists(path: string): boolean {
    try {
      return this.fs.existsSync(path)
    } catch {
      return false
    }
  }

  private normalizeExtensions(extension: LocalizedFileExtension): readonly string[] {
    return typeof extension === 'string'
      ? [extension]
      : extension
  }

  private findMatchingExtension(fileName: string, extensions: readonly string[]): string | undefined {
    return extensions.find(extension => fileName.endsWith(extension))
  }

  private resolveLocalizedPath(dir: string, baseFileName: string, extensions: readonly string[]): string {
    const defaultPath = dir === ''
      ? `${baseFileName}${extensions[0]}`
      : this.path.join(dir, `${baseFileName}${extensions[0]}`)

    for (const extension of extensions) {
      const candidate = dir === ''
        ? `${baseFileName}${extension}`
        : this.path.join(dir, `${baseFileName}${extension}`)
      if (this.exists(candidate)) return candidate
    }

    return defaultPath
  }
}

/**
 * Factory function to create a LocalizedPromptReader
 */
export function createLocalizedPromptReader(
  fs: typeof import('node:fs'),
  path: typeof import('node:path'),
  logger: ILogger,
  globalScope?: MdxGlobalScope
): LocalizedPromptReader {
  return new LocalizedPromptReader(fs, path, logger, globalScope)
}

export {
  type DirectoryReadResult,
  type LocalizedReadOptions,
  type ReadError
} from './types'
