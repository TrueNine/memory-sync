// src/scope/ScopeRegistry.ts
// Manages scope registration and merging with priority-based resolution.

import type { EvaluationScope } from '@/compiler/types'
import type { MdxGlobalScope } from '@/globals'

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
  CompileTime = 30,
}

/**
 * Registry for managing and merging scopes from multiple sources.
 * Handles priority-based resolution when the same key exists in multiple sources.
 */
export class ScopeRegistry {
  private readonly registrations: ScopeRegistration[] = []
  private globalScope: MdxGlobalScope | null = null

  /**
   * Set the global scope (provided by GlobalScopeCollector)
   * @param scope The global scope containing os, env, profile, tool namespaces
   */
  setGlobalScope(scope: MdxGlobalScope): void {
    this.globalScope = scope
  }

  /**
   * Get the current global scope
   */
  getGlobalScope(): MdxGlobalScope | null {
    return this.globalScope
  }

  /**
   * Register scope variables under a namespace
   * @param namespace The namespace name (e.g., 'myPlugin')
   * @param values Key-value pairs to register
   * @param priority Priority level for merge resolution
   */
  register(
    namespace: string,
    values: Record<string, unknown>,
    priority: ScopePriority = ScopePriority.PluginRegistered,
  ): void {
    this.registrations.push({ namespace, values, priority })
  }

  /**
   * Get all registrations (for debugging/testing)
   */
  getRegistrations(): readonly ScopeRegistration[] {
    return this.registrations
  }

  /**
   * Merge all scopes and return the final EvaluationScope.
   * Merges in priority order (low to high), with higher priority overriding lower.
   * @param compileTimeScope Optional scope passed at compile time (highest priority)
   */
  merge(compileTimeScope?: EvaluationScope): EvaluationScope {
    const result: EvaluationScope = {}

    // 1. First add global scope (lowest priority)
    if (this.globalScope != null) {
      result['os'] = { ...this.globalScope.os }
      result['env'] = { ...this.globalScope.env }
      result['profile'] = { ...this.globalScope.profile }
      result['tool'] = { ...this.globalScope.tool }
    }

    // 2. Sort by priority and merge registered scopes
    const sorted = [...this.registrations].sort((a, b) => a.priority - b.priority)
    for (const reg of sorted) {
      result[reg.namespace] = this.deepMerge(
        result[reg.namespace] as Record<string, unknown> | undefined,
        reg.values,
      )
    }

    // 3. Finally merge compile-time scope (highest priority)
    if (compileTimeScope != null) {
      for (const [key, value] of Object.entries(compileTimeScope)) {
        result[key] = typeof value === 'object' && value !== null && !Array.isArray(value)
          ? this.deepMerge(
              result[key] as Record<string, unknown> | undefined,
              value as Record<string, unknown>,
            )
          : value
      }
    }

    return result
  }

  /**
   * Deep merge two objects recursively.
   * Arrays are replaced, not merged.
   * @param target The target object (may be undefined)
   * @param source The source object to merge from
   */
  private deepMerge(
    target: Record<string, unknown> | undefined,
    source: Record<string, unknown>,
  ): Record<string, unknown> {
    if (target == null) return { ...source }

    const result = { ...target }
    for (const [key, value] of Object.entries(source)) {
      result[key] = typeof value === 'object'
        && value !== null
        && !Array.isArray(value)
        && typeof result[key] === 'object'
        && result[key] !== null
        && !Array.isArray(result[key])
        ? this.deepMerge(
            result[key] as Record<string, unknown>,
            value as Record<string, unknown>,
          )
        : value
    }
    return result
  }

  /**
   * Clear all registrations and global scope
   */
  clear(): void {
    this.registrations.length = 0
    this.globalScope = null
  }
}
