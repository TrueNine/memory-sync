/**
 * Plugin registry for inter-plugin data sharing
 * Provides type-safe storage and retrieval of plugin output data
 *
 * @see Requirements 25.1, 25.2, 25.3, 25.4
 */

/**
 * Error thrown when required registry data is not found
 */
export class RegistryDataNotFoundError extends Error {
  public pluginId: string
  public key: string

  constructor(pluginId: string, key: string) {
    super(`Required data not found: plugin="${pluginId}", key="${key}"`)
    this.name = 'RegistryDataNotFoundError'
    this.pluginId = pluginId
    this.key = key
  }
}

/**
 * Plugin registry interface for inter-plugin data sharing
 * @see Requirements 25.1, 25.2, 25.3, 25.4
 */
export interface IPluginRegistry {
  /**
   * Store plugin output data
   * @param pluginId - Plugin identifier
   * @param key - Data key
   * @param value - Data value
   * @see Requirement 25.1
   */
  set: <T>(pluginId: string, key: string, value: T) => void

  /**
   * Get plugin output data (read-only)
   * @param pluginId - Plugin identifier
   * @param key - Data key
   * @returns Read-only data or undefined if not found
   * @see Requirements 25.2, 25.4
   */
  get: <T>(pluginId: string, key: string) => Readonly<T> | undefined

  /**
   * Check if data exists
   * @param pluginId - Plugin identifier
   * @param key - Data key
   * @returns True if data exists
   * @see Requirement 25.2
   */
  has: (pluginId: string, key: string) => boolean

  /**
   * Get required plugin output data
   * Throws error if data is not found
   * @param pluginId - Plugin identifier
   * @param key - Data key
   * @returns Read-only data
   * @throws RegistryDataNotFoundError if data not found
   * @see Requirements 25.3, 25.4
   */
  getRequired: <T>(pluginId: string, key: string) => Readonly<T>
}

/**
 * Plugin registry implementation
 * Stores plugin output data in a typed registry keyed by plugin identifier
 *
 * @example
 * ```typescript
 * const registry = new PluginRegistry()
 *
 * // Plugin A stores data
 * registry.set('pluginA', 'workspaces', ['ws1', 'ws2'])
 *
 * // Plugin B retrieves data
 * const workspaces = registry.get<string[]>('pluginA', 'workspaces')
 * ```
 *
 * @see Requirements 25.1, 25.2, 25.3, 25.4
 */
export class PluginRegistry implements IPluginRegistry {
  /**
   * Internal storage: Map<pluginId, Map<key, value>>
   */
  private storage: Map<string, Map<string, unknown>> = new Map()

  /**
   * Store plugin output data
   * @param pluginId - Plugin identifier
   * @param key - Data key
   * @param value - Data value
   * @see Requirement 25.1
   */
  set<T>(pluginId: string, key: string, value: T): void {
    let pluginData = this.storage.get(pluginId)
    if (!pluginData) {
      pluginData = new Map()
      this.storage.set(pluginId, pluginData)
    }
    pluginData.set(key, value)
  }

  /**
   * Get plugin output data (read-only)
   * Returns a deep frozen copy to enforce immutability
   * @param pluginId - Plugin identifier
   * @param key - Data key
   * @returns Read-only data or undefined if not found
   * @see Requirements 25.2, 25.4
   */
  get<T>(pluginId: string, key: string): Readonly<T> | undefined {
    const pluginData = this.storage.get(pluginId)
    if (!pluginData) {
      return void 0
    }
    const value = pluginData.get(key)
    if (value === void 0) {
      return void 0
    }
    return this.deepFreeze(structuredClone(value)) as Readonly<T>
  }

  /**
   * Check if data exists
   * @param pluginId - Plugin identifier
   * @param key - Data key
   * @returns True if data exists
   * @see Requirement 25.2
   */
  has(pluginId: string, key: string): boolean {
    const pluginData = this.storage.get(pluginId)
    if (!pluginData) {
      return false
    }
    return pluginData.has(key)
  }

  /**
   * Get required plugin output data
   * Throws error if data is not found
   * @param pluginId - Plugin identifier
   * @param key - Data key
   * @returns Read-only data
   * @throws RegistryDataNotFoundError if data not found
   * @see Requirements 25.3, 25.4
   */
  getRequired<T>(pluginId: string, key: string): Readonly<T> {
    const value = this.get<T>(pluginId, key)
    if (value === void 0) {
      throw new RegistryDataNotFoundError(pluginId, key)
    }
    return value
  }

  /**
   * Deep freeze an object to enforce immutability
   * @param obj - Object to freeze
   * @returns Frozen object
   */
  private deepFreeze<T>(obj: T): T {
    if (obj === null || typeof obj !== 'object') {
      return obj
    }

    // Handle arrays
    if (Array.isArray(obj)) {
      for (const item of obj) {
        this.deepFreeze(item)
      }
      return Object.freeze(obj) as T
    }

    // Handle objects
    const propNames = Object.getOwnPropertyNames(obj)
    for (const name of propNames) {
      const value = (obj as Record<string, unknown>)[name]
      if (value !== null && typeof value === 'object') {
        this.deepFreeze(value)
      }
    }
    return Object.freeze(obj) as T
  }
}

/**
 * Create a new plugin registry instance
 * @returns New PluginRegistry instance
 */
export function createPluginRegistry(): IPluginRegistry {
  return new PluginRegistry()
}
