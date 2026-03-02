import type {MdxGlobalScope} from '@truenine/md-compiler/globals'
import type {
  DirectoryReadResult,
  Locale,
  LocalizedContent,
  LocalizedPrompt,
  LocalizedReadOptions,
  Prompt,
  PromptKind,
  ReadError
} from '@truenine/plugin-shared'
import {mdxToMd} from '@truenine/md-compiler'
import {parseMarkdown} from '@truenine/md-compiler/markdown' // Re-export types for convenience

/**
 * Universal reader for localized prompts
 * Handles reading src (multiple locales) and dist (compiled) content
 * Supports directory structures (skills) and flat files (commands, subAgents)
 */
export class LocalizedPromptReader {
  constructor(
    private fs: typeof import('node:fs'),
    private path: typeof import('node:path'),
    private logger: import('@truenine/plugin-shared').ILogger,
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
          this.logger.error(`Failed to read entry: ${name}`, {error})
        }
      }
    } catch (error) {
      errors.push({
        path: srcDir,
        error: error as Error,
        phase: 'scan'
      })
      this.logger.error(`Failed to scan directory: ${srcDir}`, {error})
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

    if (!this.exists(srcDir)) return {prompts, errors}

    const zhExtension = options.localeExtensions.zh // Find all .cn.mdx files (Chinese source files)

    try {
      const entries = this.fs.readdirSync(srcDir, {withFileTypes: true})

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(zhExtension)) continue

        const baseName = entry.name.slice(0, -zhExtension.length) // Extract name without extension (e.g., "compile.cn.mdx" -> "compile")
        const srcFilePath = this.path.join(srcDir, entry.name)

        try {
          const localized = await this.readFlatEntry(
            baseName,
            srcDir,
            distDir,
            baseName,
            options
          )

          if (localized) prompts.push(localized)
        } catch (error) {
          errors.push({
            path: srcFilePath,
            error: error as Error,
            phase: 'read'
          })
          this.logger.error(`Failed to read file: ${entry.name}`, {error})
        }
      }
    } catch (error) {
      errors.push({
        path: srcDir,
        error: error as Error,
        phase: 'scan'
      })
      this.logger.error(`Failed to scan directory: ${srcDir}`, {error})
    }

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

    const baseFileName = entryFileName ?? name // For flat: read src/{name}.cn.mdx and src/{name}.mdx // For skills: read src/{name}/skill.cn.mdx and src/{name}/skill.mdx
    const srcZhPath = this.path.join(srcEntryDir, `${baseFileName}${localeExtensions.zh}`)
    const srcEnPath = this.path.join(srcEntryDir, `${baseFileName}${localeExtensions.en}`)
    const distPath = this.path.join(distEntryDir, `${baseFileName}.mdx`)

    const distContent = await this.readDistContent(distPath, createPrompt, name) // Priority 1: Try dist first (already compiled, no need to recompile)
    if (distContent) {
      let children: string[] | undefined // Dist exists, use it directly (skip src entirely)
      if (isDirectoryStructure) children = this.scanChildren(distEntryDir, baseFileName, localeExtensions.zh)

      return {
        name,
        type: kind,
        src: {
          zh: distContent,
          default: distContent,
          defaultLocale: 'zh'
        },
        dist: distContent,
        metadata: {
          hasDist: true,
          hasMultipleLocales: false,
          isDirectoryStructure,
          ...children && children.length > 0 && {children}
        },
        paths: {
          zh: srcZhPath,
          dist: distPath
        }
      }
    }

    const zhContent = await this.readLocaleContent(srcZhPath, 'zh', createPrompt, name) // Read Chinese source (required) // Priority 2: Dist not exists, fall back to src
    if (!zhContent) {
      this.logger.warn(`Missing required Chinese source: ${srcZhPath}`)
      return null
    }

    const enContent = await this.readLocaleContent(srcEnPath, 'en', createPrompt, name) // Read English source (optional)

    const src: LocalizedPrompt<T, K>['src'] = {
      zh: zhContent,
      ...enContent && {en: enContent},
      default: zhContent,
      defaultLocale: 'zh'
    }

    const hasMultipleLocales = !!enContent

    let children: string[] | undefined // Determine children (for directory structures)
    if (isDirectoryStructure) children = this.scanChildren(srcEntryDir, baseFileName, localeExtensions.zh)

    return {
      name,
      type: kind,
      src,
      metadata: {
        hasDist: false,
        hasMultipleLocales,
        isDirectoryStructure,
        ...children && children.length > 0 && {children}
      },
      paths: {
        zh: srcZhPath,
        ...this.exists(srcEnPath) && {en: srcEnPath}
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

    const srcZhPath = `${baseName}${localeExtensions.zh}`
    const srcEnPath = `${baseName}${localeExtensions.en}`
    const distPath = this.path.join(distDir, `${name}.mdx`)

    const distContent = await this.readDistContent(distPath, createPrompt, name) // Priority 1: Try dist first (already compiled, no need to recompile)
    if (distContent) {
      return {
        name,
        type: kind,
        src: {
          zh: distContent,
          default: distContent,
          defaultLocale: 'zh'
        },
        dist: distContent,
        metadata: {
          hasDist: true,
          hasMultipleLocales: false,
          isDirectoryStructure: false
        },
        paths: {
          dist: distPath
        }
      }
    }

    const fullSrcZhPath = isSingleFile ? srcZhPath : this.path.join(srcDir, srcZhPath) // Priority 2: Dist not exists, fall back to src
    const fullSrcEnPath = isSingleFile ? srcEnPath : this.path.join(srcDir, srcEnPath)

    const zhContent = await this.readLocaleContent(fullSrcZhPath, 'zh', createPrompt, name) // Read Chinese source (required)
    if (!zhContent) return null

    const enContent = await this.readLocaleContent(fullSrcEnPath, 'en', createPrompt, name) // Read English source (optional)

    const src: LocalizedPrompt<T, K>['src'] = {
      zh: zhContent,
      ...enContent && {en: enContent},
      default: zhContent,
      defaultLocale: 'zh'
    }

    return {
      name,
      type: kind,
      src,
      metadata: {
        hasDist: false,
        hasMultipleLocales: !!enContent,
        isDirectoryStructure: false
      },
      paths: {
        zh: fullSrcZhPath,
        ...this.exists(fullSrcEnPath) ? {en: fullSrcEnPath} : {}
      }
    }
  }

  private async readLocaleContent<T extends Prompt>(
    filePath: string,
    locale: Locale,
    createPrompt: (content: string, locale: Locale, name: string) => T | Promise<T>,
    name: string
  ): Promise<LocalizedContent<T> | null> {
    if (!this.exists(filePath)) return null

    try {
      const rawMdx = this.fs.readFileSync(filePath, 'utf8')
      const stats = this.fs.statSync(filePath)

      const compileResult = await mdxToMd(rawMdx, { // Compile MDX to Markdown
        globalScope: this.globalScope,
        extractMetadata: true,
        basePath: this.path.dirname(filePath)
      })

      const parsed = parseMarkdown(rawMdx) // Parse front matter

      const prompt = await createPrompt(compileResult.content, locale, name) // Create prompt object

      const result: LocalizedContent<T> = {
        content: compileResult.content,
        lastModified: stats.mtime,
        filePath
      }

      if (rawMdx.length > 0) { // Add optional fields only if they exist
        Object.assign(result, {rawMdx})
      }
      if (parsed.yamlFrontMatter != null) Object.assign(result, {frontMatter: parsed.yamlFrontMatter})
      if (prompt != null) Object.assign(result, {prompt})

      return result
    } catch (error) {
      this.logger.error(`Failed to read locale content: ${filePath}`, {error})
      throw error
    }
  }

  private async readDistContent<T extends Prompt>(
    filePath: string,
    createPrompt: (content: string, locale: Locale, name: string) => T | Promise<T>,
    name: string
  ): Promise<LocalizedContent<T> | null> {
    if (!this.exists(filePath)) return null

    try {
      const content = this.fs.readFileSync(filePath, 'utf8')
      const stats = this.fs.statSync(filePath)

      const prompt = await createPrompt(content, 'zh', name) // Create prompt from dist content (no compilation needed)

      return {
        content,
        lastModified: stats.mtime,
        prompt,
        filePath
      }
    } catch (error) {
      this.logger.warn(`Failed to read dist content: ${filePath}`, {error})
      return null
    }
  }

  private scanChildren(
    dir: string,
    entryFileName: string,
    zhExtension: string
  ): string[] {
    const children: string[] = []

    if (!this.exists(dir)) return children

    const entryFullName = `${entryFileName}${zhExtension}`

    try {
      const scanDir = (currentDir: string, relativePath: string): void => {
        const entries = this.fs.readdirSync(currentDir, {withFileTypes: true})

        for (const entry of entries) {
          const fullPath = this.path.join(currentDir, entry.name)
          const relativeFullPath = relativePath
            ? this.path.join(relativePath, entry.name)
            : entry.name

          if (entry.isDirectory()) scanDir(fullPath, relativeFullPath)
          else if (entry.name.endsWith(zhExtension) && entry.name !== entryFullName) {
            const nameWithoutExt = entry.name.slice(0, -zhExtension.length) // Child doc: relative path without extension
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
      this.logger.warn(`Failed to scan children: ${dir}`, {error})
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
}

/**
 * Factory function to create a LocalizedPromptReader
 */
export function createLocalizedPromptReader(
  fs: typeof import('node:fs'),
  path: typeof import('node:path'),
  logger: import('@truenine/plugin-shared').ILogger,
  globalScope?: MdxGlobalScope
): LocalizedPromptReader {
  return new LocalizedPromptReader(fs, path, logger, globalScope)
}

export {
  type DirectoryReadResult,
  type LocalizedReadOptions,
  type ReadError
} from '@truenine/plugin-shared'
