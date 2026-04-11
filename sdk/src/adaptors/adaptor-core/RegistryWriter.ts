/**
 * Registry Configuration Writer
 *
 * Abstract base class for registry configuration writers.
 * Provides common functionality for reading, writing, and merging JSON registry files.
 *
 * @see Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 7.1, 7.2
 */

import type {ILogger, RegistryData, RegistryOperationResult} from './types'

import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  buildDiagnostic,
  buildFileOperationDiagnostic,
  diagnosticLines
} from '@/diagnostics'
import {createLogger} from '@/libraries/logger'
import {resolveUserPath} from '@/runtime-environment'

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
  TRegistry extends RegistryData = RegistryData
> {
  protected readonly registryPath: string

  protected readonly log: ILogger

  protected constructor(registryPath: string, logger?: ILogger) {
    this.registryPath = this.resolvePath(registryPath)
    this.log = logger ?? createLogger(this.constructor.name)
  }

  protected resolvePath(p: string): string {
    if (p.startsWith('~')) return resolveUserPath(p)
    return path.resolve(p)
  }

  protected getRegistryDir(): string {
    return path.dirname(this.registryPath)
  }

  protected ensureRegistryDir(): void {
    const dir = this.getRegistryDir()
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true})
  }

  read(): TRegistry {
    if (!fs.existsSync(this.registryPath)) {
      this.log.debug('registry not found', {path: this.registryPath})
      return this.createInitialRegistry()
    }

    try {
      const content = fs.readFileSync(this.registryPath, 'utf8')
      return JSON.parse(content) as TRegistry
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error(buildFileOperationDiagnostic({
        code: 'REGISTRY_READ_FAILED',
        title: 'Failed to read registry file',
        operation: 'read',
        targetKind: 'registry file',
        path: this.registryPath,
        error: errMsg
      }))
      return this.createInitialRegistry()
    }
  }

  protected write(data: TRegistry, dryRun?: boolean): boolean {
    const updatedData = { // Update lastUpdated timestamp
      ...data,
      lastUpdated: new Date().toISOString()
    } as TRegistry

    if (dryRun === true) {
      this.log.trace({action: 'dryRun', type: 'registry', path: this.registryPath})
      return true
    }

    const tempPath = `${this.registryPath}.tmp.${Date.now()}`

    try {
      this.ensureRegistryDir()

      const content = JSON.stringify(updatedData, null, 2) // Write to temporary file first
      fs.writeFileSync(tempPath, content, 'utf8')

      fs.renameSync(tempPath, this.registryPath) // Atomic rename to replace target

      this.log.trace({action: 'write', type: 'registry', path: this.registryPath})
      return true
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error(buildFileOperationDiagnostic({
        code: 'REGISTRY_WRITE_FAILED',
        title: 'Failed to write registry file',
        operation: 'write',
        targetKind: 'registry file',
        path: this.registryPath,
        error: errMsg
      }))

      try { // Cleanup temp file if it exists
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
      }
      catch {
      } // Ignore cleanup errors

      return false
    }
  }

  register(
    entries: readonly TEntry[],
    dryRun?: boolean
  ): readonly RegistryOperationResult[] {
    const results: RegistryOperationResult[] = []

    const existing = this.read() // Read existing registry

    const merged = this.merge(existing, entries) // Merge new entries

    const writeSuccess = this.write(merged, dryRun) // Write updated registry

    for (const entry of entries) { // Build results for each entry
      const entryName = this.getEntryName(entry)
      if (writeSuccess) {
        results.push({success: true, entryName})
        if (dryRun === true) this.log.trace({action: 'dryRun', type: 'registerEntry', entryName})
        else this.log.trace({action: 'register', type: 'entry', entryName})
      } else {
        results.push({success: false, entryName, error: new Error(`Failed to write registry file`)})
        this.log.error(buildDiagnostic({
          code: 'REGISTRY_ENTRY_REGISTRATION_FAILED',
          title: `Failed to register registry entry: ${entryName}`,
          rootCause: diagnosticLines(
            `tnmsc could not persist the registry entry "${entryName}" because the registry write step failed.`
          ),
          exactFix: diagnosticLines(
            'Fix the registry path permissions or invalid on-disk state, then rerun tnmsc.'
          ),
          details: {
            entryName,
            registryPath: this.registryPath
          }
        }))
      }
    }

    return results
  }

  protected generateEntryId(prefix?: string): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).slice(2, 8)
    const id = `${timestamp}-${random}`
    return prefix != null ? `${prefix}-${id}` : id
  }

  protected abstract getEntryName(entry: TEntry): string

  protected abstract merge(existing: TRegistry, entries: readonly TEntry[]): TRegistry

  protected abstract createInitialRegistry(): TRegistry
}
