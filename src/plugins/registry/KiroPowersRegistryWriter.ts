/**
 * Kiro Powers Registry Writer
 *
 * Concrete implementation of RegistryWriter for managing Kiro's powers registry.
 * Manages ~/.kiro/powers/registry.json file.
 *
 * @see Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
 */

import type {ILogger} from '@/log'
import type {SkillPrompt} from '@/types/InputTypes'
import type {KiroPowerEntry, KiroPowerSource, KiroPowersRegistry, KiroRepoSource} from '@/types/RegistryTypes'

import {RegistryWriter} from '@/plugins'

/**
 * Registry writer for Kiro powers.
 * Manages ~/.kiro/powers/registry.json file.
 *
 * @see Requirements 4.1, 4.2
 */
export class KiroPowersRegistryWriter extends RegistryWriter<KiroPowerEntry, KiroPowersRegistry> {
  /**
   * Default path to Kiro powers registry file.
   */
  private static readonly REGISTRY_PATH = '~/.kiro/powers/registry.json'

  /**
   * Default version for new registry files.
   */
  private static readonly DEFAULT_VERSION = '1.0.0'

  /**
   * Creates a new KiroPowersRegistryWriter instance.
   *
   * @param logger - Optional logger instance
   */
  constructor(logger?: ILogger) {
    super(KiroPowersRegistryWriter.REGISTRY_PATH, logger)
  }

  /**
   * Create initial empty Kiro registry structure.
   * Matches Kiro's expected format: version, powers, repoSources, lastUpdated
   *
   * @returns A new empty Kiro powers registry
   * @see Requirements 4.1, 4.2
   */
  protected createInitialRegistry(): KiroPowersRegistry {
    return {
      version: KiroPowersRegistryWriter.DEFAULT_VERSION,
      powers: {},
      repoSources: {},
      lastUpdated: new Date().toISOString(),
    }
  }

  /**
   * Get the name of a power entry for logging purposes.
   *
   * @param entry - The power entry
   * @returns The power name
   */
  protected getEntryName(entry: KiroPowerEntry): string {
    return entry.name
  }

  /**
   * Merge new power entries into existing registry.
   * Also updates repoSources for each power.
   *
   * @param existing - The existing registry data
   * @param entries - The new power entries to merge
   * @returns The merged registry data
   * @see Requirements 4.3, 4.4, 4.5, 4.6, 4.7
   */
  protected merge(
    existing: KiroPowersRegistry,
    entries: readonly KiroPowerEntry[],
  ): KiroPowersRegistry {
    const powers = {...existing.powers} // Start with existing powers and repoSources
    const repoSources = {...existing.repoSources}

    for (const entry of entries) {
      powers[entry.name] = entry // Add/update power entry (Requirements 4.3, 4.7)

      const repoSource = this.buildRepoSource(entry) // Build and add/update repoSource entry using repoId as key (Requirements 4.4)
      const repoId = entry.source.repoId ?? entry.name
      repoSources[repoId] = repoSource
    }

    return { // Match Kiro's expected field order: version, powers, repoSources, kiroRecommendedRepo, lastUpdated // Preserve version and kiroRecommendedRepo fields (Requirements 4.5, 4.6)
      version: existing.version,
      powers,
      repoSources,
      ...existing.kiroRecommendedRepo != null && {
        kiroRecommendedRepo: existing.kiroRecommendedRepo,
      },
      lastUpdated: existing.lastUpdated,
    }
  }

  /**
   * Build a KiroPowerEntry from a SkillPrompt.
   * Extracts metadata from skill's YAML front matter.
   *
   * @param skill - The skill prompt to convert
   * @param installPath - The installation path for the power
   * @returns A KiroPowerEntry object
   *
   * Field order matches Kiro's expected format:
   * name → description → mcpServers → author → keywords → displayName → installed → installedAt → installPath → source → sourcePath
   *
   * @see Requirements 2.4, 4.8
   */
  buildPowerEntry(skill: SkillPrompt, installPath: string): KiroPowerEntry {
    const {yamlFrontMatter, mcpConfig} = skill
    const repoId = this.generateEntryId('local')

    const source: KiroPowerSource = { // Build source object with repo type (Kiro uses "repo" for local installations)
      type: 'repo',
      repoId,
      repoName: installPath,
    }

    const mcpServerNames = mcpConfig != null // Extract MCP server names if skill has MCP configuration
      ? Object.keys(mcpConfig.mcpServers)
      : null

    return { // name → description → mcpServers → author → keywords → displayName → installed → installedAt → installPath → source → sourcePath // Build entry with fields in Kiro's expected order:
      name: yamlFrontMatter.name,
      description: yamlFrontMatter.description,
      ...mcpServerNames != null && mcpServerNames.length > 0 && {mcpServers: mcpServerNames}, // mcpServers comes after description, before author (Kiro format)
      ...yamlFrontMatter.author != null && {author: yamlFrontMatter.author},
      keywords: yamlFrontMatter.keywords ?? [],
      ...yamlFrontMatter.displayName != null && {displayName: yamlFrontMatter.displayName},
      installed: true, // Set installed: true (Requirements 4.8)
      installedAt: new Date().toISOString(), // Generate installedAt timestamp in ISO 8601 format (Requirements 2.4)
      installPath,
      source,
      sourcePath: installPath,
    }
  }

  /**
   * Get the official Kiro powers registry from build-time constant.
   * Falls back to empty registry if constant is not available (e.g., in tests).
   *
   * @returns The official Kiro powers registry
   */
  private getOfficialRegistry(): KiroPowersRegistry {
    try {
      if (typeof __KIRO_GLOBAL_POWERS_REGISTRY__ !== 'undefined') return JSON.parse(__KIRO_GLOBAL_POWERS_REGISTRY__) as KiroPowersRegistry // __KIRO_GLOBAL_POWERS_REGISTRY__ is injected at build time by tsdown
    }
    catch {
      this.log.debug('Failed to parse official registry, using empty registry')
    }
    return this.createInitialRegistry() // Fallback for tests or when constant is not available
  }

  /**
   * Reset the registry to official Kiro powers registry state.
   * Overwrites the entire registry with the official registry from build-time constant.
   *
   * @param dryRun - If true, log intended actions without modifying files
   * @returns True if operation succeeded, false otherwise
   * @see Requirements 6.1, 6.2, 6.3, 6.4
   */
  unregisterLocalPowers(dryRun?: boolean): boolean {
    const officialRegistry = this.getOfficialRegistry() // Get official registry from build-time constant

    const resetRegistry: KiroPowersRegistry = { // Update lastUpdated timestamp
      ...officialRegistry,
      lastUpdated: new Date().toISOString(),
    }

    this.log.trace({action: dryRun === true ? 'dryRun' : 'reset', type: 'registry', powerCount: Object.keys(resetRegistry.powers).length})

    return this.write(resetRegistry, dryRun) // Write reset registry (respects dry-run)
  }

  /**
   * Build a KiroRepoSource for a power entry.
   *
   * @param power - The power entry to create a repo source for
   * @returns A KiroRepoSource object
   * @see Requirements 3.1, 3.4, 3.5
   */
  private buildRepoSource(power: KiroPowerEntry): KiroRepoSource {
    const now = new Date().toISOString()

    return { // Use sourcePath as name (matches Kiro's format) // Build base repo source with required fields
      name: power.sourcePath ?? power.installPath ?? power.name, // Use full path as repo source name (matches Kiro's format)
      type: 'local', // Set type based on source type (Requirements 3.1)
      enabled: true,
      addedAt: now, // Set timestamps (Requirements 3.4)
      powerCount: 1, // Single power per local source
      ...power.sourcePath != null && {path: power.sourcePath}, // Only include path if it has a value (Requirements 3.5)
      lastSync: now,
    }
  }
}
