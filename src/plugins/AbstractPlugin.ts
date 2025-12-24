import type { Logger } from '@/log'
import type { PluginKind } from '@/types/Enums'
import type { Plugin } from '@/types/PluginTypes'

import { createLogger } from '@/log'

/**
 * Abstract base class for all plugins.
 * Provides common functionality including logger initialization and basic plugin properties.
 *
 * @template T - The plugin kind (Input or Output)
 *
 * @example
 * ```typescript
 * class MyInputPlugin extends AbstractPlugin<PluginKind.Input> {
 *   constructor() {
 *     super('MyInputPlugin', PluginKind.Input)
 *   }
 * }
 * ```
 */
export abstract class AbstractPlugin<T extends PluginKind = PluginKind> implements Plugin<T> {
  /**
   * The type/kind of this plugin (Input or Output).
   * Set during construction and cannot be changed.
   */
  readonly type: T

  /**
   * The unique name of this plugin.
   * Used for identification, logging, and dependency resolution.
   */
  readonly name: string

  /**
   * Cached logger instance for this plugin.
   * Lazily initialized on first access to respect global log level.
   */
  private _log?: Logger

  /**
   * Logger instance for this plugin.
   * Lazily initialized to respect global log level set by CLI args.
   */
  get log(): Logger {
    if (this._log == null) {
      this._log = createLogger(this.name)
    }
    return this._log
  }

  /**
   * Optional list of plugin names that this plugin depends on.
   * Dependencies will be executed before this plugin.
   */
  readonly dependsOn?: readonly string[]

  /**
   * Creates a new AbstractPlugin instance.
   *
   * @param name - The unique name of the plugin
   * @param type - The plugin kind (Input or Output)
   * @param dependsOn - Optional array of plugin names this plugin depends on
   */
  protected constructor(name: string, type: T, dependsOn?: readonly string[]) {
    this.name = name
    this.type = type
    if (dependsOn != null) {
      this.dependsOn = dependsOn
    }
  }
}
