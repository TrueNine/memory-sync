import type {EvaluationScope} from '@truenine/md-compiler'
import type {EnvironmentContext, MdComponent, MdxGlobalScope, OsInfo, ToolReferences, UserProfile} from '@truenine/md-compiler/globals' // Collects and manages global scope variables for MDX expression evaluation. // src/scope/GlobalScopeCollector.ts
import type {UserConfigFile} from '../types'
import * as os from 'node:os'
import process from 'node:process'
import {OsKind, ShellKind, ToolPresets} from '@truenine/md-compiler/globals'

/**
 * Tool preset names supported by GlobalScopeCollector
 */
export type ToolPresetName = keyof typeof ToolPresets

/**
 * Options for GlobalScopeCollector
 */
export interface GlobalScopeCollectorOptions {
  /** User configuration file */
  readonly userConfig?: UserConfigFile | undefined
  /** Tool preset to use (default: 'default') */
  readonly toolPreset?: ToolPresetName | undefined
}

/**
 * Collects global scope variables from system, environment, and user configuration.
 * The collected scope is available in MDX templates via expressions like {os.platform}, {env.NODE_ENV}, etc.
 */
export class GlobalScopeCollector {
  private readonly userConfig: UserConfigFile | undefined
  private readonly toolPreset: ToolPresetName

  constructor(options: GlobalScopeCollectorOptions = {}) {
    this.userConfig = options.userConfig
    this.toolPreset = options.toolPreset ?? 'default'
  }

  collect(): MdxGlobalScope {
    return {
      os: this.collectOsInfo(),
      env: this.collectEnvContext(),
      profile: this.collectProfile(),
      tool: this.collectToolReferences(),
      Md: this.createMdComponent()
    }
  }

  private collectOsInfo(): OsInfo {
    const platform = os.platform()
    return {
      platform,
      arch: os.arch(),
      hostname: os.hostname(),
      homedir: os.homedir(),
      tmpdir: os.tmpdir(),
      type: os.type(),
      release: os.release(),
      shellKind: this.detectShellKind(),
      kind: this.detectOsKind(platform)
    }
  }

  private detectOsKind(platform: string): OsKind {
    switch (platform) {
      case 'win32': return OsKind.Win
      case 'darwin': return OsKind.Mac
      case 'linux':
      case 'freebsd':
      case 'openbsd':
      case 'sunos':
      case 'aix': return OsKind.Linux
      default: return OsKind.Unknown
    }
  }

  private detectShellKind(): ShellKind {
    const shell = process.env['SHELL'] ?? process.env['ComSpec'] ?? ''
    const s = shell.toLowerCase()

    if (s.includes('bash')) return ShellKind.Bash
    if (s.includes('zsh')) return ShellKind.Zsh
    if (s.includes('fish')) return ShellKind.Fish
    if (s.includes('pwsh')) return ShellKind.Pwsh
    if (s.includes('powershell')) return ShellKind.PowerShell
    if (s.includes('cmd')) return ShellKind.Cmd
    if (s.endsWith('/sh')) return ShellKind.Sh

    return ShellKind.Unknown
  }

  private collectEnvContext(): EnvironmentContext {
    return {...process.env}
  }

  private collectProfile(): UserProfile {
    if (this.userConfig?.profile != null) return this.userConfig.profile as UserProfile
    return {}
  }

  private collectToolReferences(): ToolReferences {
    const defaults: ToolReferences = {...ToolPresets.default}
    if (this.toolPreset === 'claudeCode') return {...defaults, ...ToolPresets.claudeCode}
    if (this.toolPreset === 'kiro') return {...defaults, ...ToolPresets.kiro}
    return defaults
  }

  private createMdComponent(): MdComponent {
    const mdComponent = ((props: {when?: boolean, children?: unknown}) => {
      if (props.when === false) return null
      return props.children
    }) as MdComponent

    mdComponent.Line = (props: {when?: boolean, children?: unknown}) => {
      if (props.when === false) return null
      return props.children
    }

    return mdComponent
  }
}

/**
 * Represents a single scope registration
 */
export interface ScopeRegistration {
  readonly namespace: string
  readonly values: Record<string, unknown>
  readonly priority: number
}

/**
 * Priority levels for scope sources.
 * Higher values take precedence over lower values during merge.
 */
export enum ScopePriority {
  /** System default values (os, default tool) */
  SystemDefault = 0,
  /** Values from configuration file (profile, custom tool) */
  UserConfig = 10,
  /** Values registered by plugins */
  PluginRegistered = 20,
  /** Values passed at MDX compile time */
  CompileTime = 30
}

/**
 * Registry for managing and merging scopes from multiple sources.
 * Handles priority-based resolution when the same key exists in multiple sources.
 */
export class ScopeRegistry {
  private readonly registrations: ScopeRegistration[] = []
  private globalScope: MdxGlobalScope | null = null

  setGlobalScope(scope: MdxGlobalScope): void {
    this.globalScope = scope
  }

  getGlobalScope(): MdxGlobalScope | null {
    return this.globalScope
  }

  register(
    namespace: string,
    values: Record<string, unknown>,
    priority: ScopePriority = ScopePriority.PluginRegistered
  ): void {
    this.registrations.push({namespace, values, priority})
  }

  getRegistrations(): readonly ScopeRegistration[] {
    return this.registrations
  }

  merge(compileTimeScope?: EvaluationScope): EvaluationScope {
    const result: EvaluationScope = {}

    if (this.globalScope != null) { // 1. First add global scope (lowest priority)
      result['os'] = {...this.globalScope.os}
      result['env'] = {...this.globalScope.env}
      result['profile'] = {...this.globalScope.profile}
      result['tool'] = {...this.globalScope.tool}
    }

    const sorted = [...this.registrations].sort((a, b) => a.priority - b.priority) // 2. Sort by priority and merge registered scopes
    for (const reg of sorted) result[reg.namespace] = this.deepMerge(result[reg.namespace] as Record<string, unknown> | undefined, reg.values)

    if (compileTimeScope != null) { // 3. Finally merge compile-time scope (highest priority)
      for (const [key, value] of Object.entries(compileTimeScope)) {
        result[key] = typeof value === 'object' && value !== null && !Array.isArray(value)
          ? this.deepMerge(result[key] as Record<string, unknown> | undefined, value as Record<string, unknown>)
          : value
      }
    }

    return result
  }

  private deepMerge(
    target: Record<string, unknown> | undefined,
    source: Record<string, unknown>
  ): Record<string, unknown> {
    if (target == null) return {...source}

    const result = {...target}
    for (const [key, value] of Object.entries(source)) {
      result[key] = typeof value === 'object'
        && value !== null
        && !Array.isArray(value)
        && typeof result[key] === 'object'
        && result[key] !== null
        && !Array.isArray(result[key])
        ? this.deepMerge(result[key] as Record<string, unknown>, value as Record<string, unknown>)
        : value
    }
    return result
  }

  resolve(expression: string): string {
    const scope = this.merge()
    return expression.replaceAll(/\$\{([^}]+)\}/g, (_, key: string) => {
      const parts = key.split('.')
      let value: unknown = scope
      for (const part of parts) value = (value as Record<string, unknown>)?.[part]
      return value != null ? String(value) : `\${${key}}`
    })
  }

  clear(): void {
    this.registrations.length = 0
    this.globalScope = null
  }
}
