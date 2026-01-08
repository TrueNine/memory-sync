/**
 * Registry Configuration Writer
 *
 * Abstract base class for registry configuration writers.
 * Provides common functionality for reading, writing, and merging JSON registry files.
 *
 * @see Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 7.1, 7.2
 */

import type {ILogger} from '@/log'
import type {RegistryData, RegistryOperationResult} from '@/types/RegistryTypes'

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {createLogger} from '@/log'

/**
 * Abstract base class for registry configuration writers.
 * Provides common functionality for reading, writing, and merging JSON registry files.
 *
 * @template TEntry - The type of entries stored in the registry
 * @template TRegistry - The full registry data structure type
 *
 * @see Requirements 1.1, 1.2, 1.3, 1.7
 */
export abstract class RegistryWriter<
  TEntry,
  TRegistry extends RegistryData = RegistryData,
> {
  /**
   * The absolute path to the registry file.
   */
  protected readonly registryPath: string

  /**
   * Logger instance for this registry writer.
   */
  protected readonly log: ILogger

  /**
   * Creates a new RegistryWriter instance.
   *
   * @param registryPath - The path to the registry file (supports ~ for home directory)
   * @param logger - Optional logger instance (creates one if not provided)
   */
  protected constructor(registryPath: string, logger?: ILogger) {
    this.registryPath = this.resolvePath(registryPath)
    this.log = logger ?? createLogger(this.constructor.name)
  }

  /**
   * Resolve a path, expanding ~ to home directory.
   *
   * @param p - The path to resolve
   * @returns The resolved absolute path
   */
  protected resolvePath(p: string): string {
    if (p.startsWith('~')) return path.join(os.homedir(), p.slice(1))
    return path.resolve(p)
  }

  /**
   * Get the directory containing the registry file.
   *
   * @returns The directory path
   */
  protected getRegistryDir(): string {
    return path.dirname(this.registryPath)
  }

  /**
   * Ensure the registry directory exists.
   */
  protected ensureRegistryDir(): void {
    const dir = this.getRegistryDir()
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true})
  }

  /**
   * Read the registry file from disk.
   * Returns initial registry structure if file doesn't exist or is invalid.
   *
   * @returns The registry data
   * @see Requirements 1.1, 1.4, 1.5
   */
  read(): TRegistry {
    if (!fs.existsSync(this.registryPath)) {
      this.log.debug('registry not found', {path: this.registryPath})
      return this.createInitialRegistry()
    }

    try {
      const content = fs.readFileSync(this.registryPath, 'utf8')
      return JSON.parse(content) as TRegistry
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error('parse failed', {path: this.registryPath, error: errMsg})
      return this.createInitialRegistry()
    }
  }

  /**
   * Write the registry data to disk atomically.
   * Uses write-to-temp-then-rename pattern for safety.
   *
   * @param data - The registry data to write
   * @param dryRun - If true, log intended actions without modifying files
   * @returns True if write succeeded, false otherwise
   * @see Requirements 1.2, 1.6, 1.8, 7.1, 7.2
   */
  protected write(data: TRegistry, dryRun?: boolean): boolean {
    // Update lastUpdated timestamp
    const updatedData = {
      ...data,
      lastUpdated: new Date().toISOString(),
    } as TRegistry

    if (dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'registry', path: this.registryPath})
      return true
    }

    const tempPath = `${this.registryPath}.tmp.${Date.now()}`

    try {
      this.ensureRegistryDir()

      // Write to temporary file first
      const content = JSON.stringify(updatedData, null, 2)
      fs.writeFileSync(tempPath, content, 'utf8')

      // Atomic rename to replace target
      fs.renameSync(tempPath, this.registryPath)

      this.log.trace({action: 'write', type: 'registry', path: this.registryPath})
      return true
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'registry', path: this.registryPath, error: errMsg})

      // Cleanup temp file if it exists
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
      } catch {
        // Ignore cleanup errors
      }

      return false
    }
  }

  /**
   * Register multiple entries in the registry.
   * Main public API for adding/updating entries.
   *
   * @param entries - The entries to register
   * @param dryRun - If true, log intended actions without modifying files
   * @returns Array of operation results, one for each entry
   * @see Requirements 1.3, 1.7
   */
  register(
    entries: readonly TEntry[],
    dryRun?: boolean,
  ): readonly RegistryOperationResult[] {
    const results: RegistryOperationResult[] = []

    // Read existing registry
    const existing = this.read()

    // Merge new entries
    const merged = this.merge(existing, entries)

    // Write updated registry
    const writeSuccess = this.write(merged, dryRun)

    // Build results for each entry
    for (const entry of entries) {
      const entryName = this.getEntryName(entry)
      if (writeSuccess) {
        results.push({
          success: true,
          entryName,
        })
        if (dryRun === true) this.log.trace({action: 'dryRun', type: 'registerEntry', entryName})
        else this.log.trace({action: 'register', type: 'entry', entryName})
      } else {
        results.push({
          success: false,
          entryName,
          error: new Error(`Failed to write registry file`),
        })
        this.log.error('register entry failed', {entryName})
      }
    }

    return results
  }

  /**
   * Generate a unique identifier for registry entries.
   * Uses timestamp-based ID generation.
   *
   * @param prefix - Optional prefix for the ID
   * @returns A unique identifier string
   * @see Requirements 3.4
   */
  protected generateEntryId(prefix?: string): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).slice(2, 8)
    const id = `${timestamp}-${random}`
    return prefix != null ? `${prefix}-${id}` : id
  }

  /**
   * Get the name/identifier of an entry for logging purposes.
   * Subclasses should override this to extract the appropriate name field.
   *
   * @param entry - The entry to get the name from
   * @returns The entry name
   */
  protected abstract getEntryName(entry: TEntry): string

  /**
   * Merge new entries into existing registry data.
   * Preserves existing entries not being updated.
   *
   * @param existing - The existing registry data
   * @param entries - The new entries to merge
   * @returns The merged registry data
   */
  protected abstract merge(existing: TRegistry, entries: readonly TEntry[]): TRegistry

  /**
   * Create the initial empty registry structure.
   *
   * @returns A new empty registry
   */
  protected abstract createInitialRegistry(): TRegistry
}
