import type {PromptKind} from './Enums'
import type {Prompt} from './PromptTypes'

/**
 * Supported locale codes
 */
export type Locale = 'zh' | 'en'

/**
 * Localized content wrapper for a single locale
 * Contains both compiled content and raw MDX source
 */
export interface LocalizedContent<T extends Prompt = Prompt> {
  /** Compiled/processed content */
  readonly content: string

  /** Original MDX source (before compilation) */
  readonly rawMdx?: string

  /** Extracted front matter */
  readonly frontMatter?: Record<string, unknown>

  /** File last modified timestamp */
  readonly lastModified: Date

  /** Full prompt object (optional, for extended access) */
  readonly prompt?: T

  /** Absolute file path */
  readonly filePath: string
}

/**
 * Source content container for all locales
 */
export interface LocalizedSource<T extends Prompt = Prompt> {
  /** Chinese content (.cn.mdx) */
  readonly zh?: LocalizedContent<T>

  /** English content (.mdx) */
  readonly en?: LocalizedContent<T>

  /** Default locale content (typically zh) */
  readonly default: LocalizedContent<T>

  /** Which locale is the default */
  readonly defaultLocale: Locale
}

/** Universal localized prompt wrapper */
export interface LocalizedPrompt<T extends Prompt = Prompt, K extends PromptKind = PromptKind> {
  readonly name: string // Prompt identifier name
  readonly type: K // Prompt type kind
  readonly src: LocalizedSource<T> // Source files content (src directory)
  readonly dist?: LocalizedContent<T> // Compiled/dist content (dist directory, optional)

  /** Metadata flags */
  readonly metadata: {
    readonly hasDist: boolean // Whether dist content exists
    readonly hasMultipleLocales: boolean // Whether multiple locales exist in src
    readonly isDirectoryStructure: boolean // Whether this is a directory-based prompt (like skills)

    /** Available child items (for directory structures) */
    readonly children?: string[]
  }

  /** File paths for all variants */
  readonly paths: {
    readonly zh?: string
    readonly en?: string
    readonly dist?: string
  }
}

/**
 * Type aliases for specific prompt types
 */
export type LocalizedSkillPrompt = LocalizedPrompt<
  import('./InputTypes').SkillPrompt,
  PromptKind.Skill
>

export type LocalizedFastCommandPrompt = LocalizedPrompt<
  import('./InputTypes').FastCommandPrompt,
  PromptKind.FastCommand
>

export type LocalizedSubAgentPrompt = LocalizedPrompt<
  import('./InputTypes').SubAgentPrompt,
  PromptKind.SubAgent
>

export type LocalizedRulePrompt = LocalizedPrompt<
  import('./InputTypes').RulePrompt,
  PromptKind.Rule
>

export type LocalizedReadmePrompt = LocalizedPrompt<
  import('./InputTypes').ReadmePrompt,
  PromptKind.Readme
>

/**
 * Unified prompts container for CollectedInputContext
 * Replaces individual prompt arrays with localized versions
 */
export interface PromptsContext {
  /** Skill prompts with localization */
  readonly skills: LocalizedSkillPrompt[]

  /** Fast command prompts with localization */
  readonly commands: LocalizedFastCommandPrompt[]

  /** Sub-agent prompts with localization */
  readonly subAgents: LocalizedSubAgentPrompt[]

  /** Rule prompts with localization */
  readonly rules: LocalizedRulePrompt[]

  /** Readme prompts with localization */
  readonly readme: LocalizedReadmePrompt[]

  /** Global memory prompt with localization */
  readonly globalMemory?: LocalizedPrompt

  /** Workspace memory prompt with localization */
  readonly workspaceMemory?: LocalizedPrompt
}

/**
 * Factory function type for creating localized prompts
 */
export type LocalizedPromptFactory<T extends Prompt, K extends PromptKind> = (
  name: string,
  src: LocalizedSource<T>,
  dist?: LocalizedContent<T>,
  metadata?: Partial<LocalizedPrompt<T, K>['metadata']>
) => LocalizedPrompt<T, K>

/**
 * Options for reading localized prompts from different structures
 */
export interface LocalizedReadOptions<T extends Prompt, K extends PromptKind> {
  /** File extensions for each locale */
  readonly localeExtensions: {
    readonly zh: string
    readonly en: string
  }

  /** Entry file name (without extension, e.g., 'skill' for skills) */
  readonly entryFileName?: string

  /** Create prompt from content */
  readonly createPrompt: (content: string, locale: Locale, name: string) => T | Promise<T>

  /** Prompt kind */
  readonly kind: K

  /** Whether this is a directory-based structure */
  readonly isDirectoryStructure: boolean
}

/**
 * Result of reading a directory structure (like skills)
 */
export interface DirectoryReadResult<T extends Prompt, K extends PromptKind> {
  readonly prompts: LocalizedPrompt<T, K>[]
  readonly errors: ReadError[]
}

/**
 * Error during reading
 */
export interface ReadError {
  readonly path: string
  readonly error: Error
  readonly phase: 'scan' | 'read' | 'compile'
}

/**
 * Locale selector for output plugins
 */
export interface LocaleSelector {
  /** Select which locale to use for output */
  select: <T extends Prompt>(localized: LocalizedPrompt<T>) => LocalizedContent<T>

  /** Check if a locale is available */
  isAvailable: <T extends Prompt>(localized: LocalizedPrompt<T>, locale: Locale) => boolean
}

/**
 * Configuration for localization behavior
 */
export interface LocalizationConfig {
  /** Default locale for input reading */
  readonly defaultInputLocale: Locale

  /** Preferred locale for output (can be 'dist' to use compiled content) */
  readonly preferredOutputLocale: Locale | 'dist'

  /** Fallback behavior when preferred locale is not available */
  readonly fallbackBehavior: 'use-default' | 'skip' | 'throw'

  /** Whether to compile MDX on-the-fly if dist is missing */
  readonly autoCompile: boolean
}

/** Default localization configuration */
export const DEFAULT_LOCALIZATION_CONFIG: LocalizationConfig = {
  defaultInputLocale: 'zh',
  preferredOutputLocale: 'dist',
  fallbackBehavior: 'use-default',
  autoCompile: true
}

/**
 * Helper type to extract the prompt type from a LocalizedPrompt
 */
export type ExtractPromptType<T> = T extends LocalizedPrompt<infer P> ? P : never

/**
 * Helper type to extract the kind from a LocalizedPrompt
 */
export type ExtractPromptKind<T> = T extends LocalizedPrompt<Prompt, infer K> ? K : never
