import type {EvaluationScope} from 'memory-sync-cli/src/compiler/types' // Manages scope registration and merging with priority-based resolution. // src/scope/ScopeRegistry.ts
import type {MdxGlobalScope} from 'memory-sync-cli/src/globals'

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

  clear(): void {
    this.registrations.length = 0
    this.globalScope = null
  }
}
