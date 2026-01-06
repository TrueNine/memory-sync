/**
 * Kiro Powers Registry Writer
 *
 * Concrete implementation of RegistryWriter for managing Kiro's powers registry.
 * Manages ~/.kiro/powers/registry.json file.
 *
 * @see Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
 */

import type { ILogger } from '@/log'
import type { SkillPrompt } from '@/types/InputTypes'
import type { KiroPowerEntry, KiroPowerSource, KiroPowersRegistry, KiroRepoSource } from '@/types/RegistryTypes'

import { RegistryWriter } from '@/plugins'

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
    // Start with existing powers and repoSources
    const powers = { ...existing.powers }
    const repoSources = { ...existing.repoSources }

    for (const entry of entries) {
      // Add/update power entry (Requirements 4.3, 4.7)
      powers[entry.name] = entry

      // Build and add/update repoSource entry using repoId as key (Requirements 4.4)
      const repoSource = this.buildRepoSource(entry)
      const repoId = entry.source.repoId ?? entry.name
      repoSources[repoId] = repoSource
    }

    // Preserve version and kiroRecommendedRepo fields (Requirements 4.5, 4.6)
    // Match Kiro's expected field order: version, powers, repoSources, kiroRecommendedRepo, lastUpdated
    return {
      version: existing.version,
      powers,
      repoSources,
      ...(existing.kiroRecommendedRepo != null && {
        kiroRecommendedRepo: existing.kiroRecommendedRepo,
      }),
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
    const { yamlFrontMatter, mcpConfig } = skill
    const repoId = this.generateEntryId('local')

    // Build source object with repo type (Kiro uses "repo" for local installations)
    const source: KiroPowerSource = {
      type: 'repo',
      repoId,
      repoName: installPath,
    }

    // Extract MCP server names if skill has MCP configuration
    const mcpServerNames = mcpConfig != null
      ? Object.keys(mcpConfig.mcpServers)
      : null

    // Build entry with fields in Kiro's expected order:
    // name → description → mcpServers → author → keywords → displayName → installed → installedAt → installPath → source → sourcePath
    return {
      name: yamlFrontMatter.name,
      description: yamlFrontMatter.description,
      // mcpServers comes after description, before author (Kiro format)
      ...(mcpServerNames != null && mcpServerNames.length > 0 && { mcpServers: mcpServerNames }),
      ...(yamlFrontMatter.author != null && { author: yamlFrontMatter.author }),
      keywords: yamlFrontMatter.keywords ?? [],
      ...(yamlFrontMatter.displayName != null && { displayName: yamlFrontMatter.displayName }),
      // Set installed: true (Requirements 4.8)
      installed: true,
      // Generate installedAt timestamp in ISO 8601 format (Requirements 2.4)
      installedAt: new Date().toISOString(),
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
      // __KIRO_GLOBAL_POWERS_REGISTRY__ is injected at build time by tsdown
      if (typeof __KIRO_GLOBAL_POWERS_REGISTRY__ !== 'undefined') {
        return JSON.parse(__KIRO_GLOBAL_POWERS_REGISTRY__) as KiroPowersRegistry
      }
    } catch {
      this.log.debug('Failed to parse official registry, using empty registry')
    }
    // Fallback for tests or when constant is not available
    return this.createInitialRegistry()
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
    // Get official registry from build-time constant
    const officialRegistry = this.getOfficialRegistry()

    // Update lastUpdated timestamp
    const resetRegistry: KiroPowersRegistry = {
      ...officialRegistry,
      lastUpdated: new Date().toISOString(),
    }

    this.log.trace({
      action: dryRun === true ? 'dryRun' : 'reset',
      type: 'registry',
      powerCount: Object.keys(resetRegistry.powers).length,
    })

    // Write reset registry (respects dry-run)
    return this.write(resetRegistry, dryRun)
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

    // Build base repo source with required fields
    // Use sourcePath as name (matches Kiro's format)
    return {
      // Use full path as repo source name (matches Kiro's format)
      name: power.sourcePath ?? power.installPath ?? power.name,
      // Set type based on source type (Requirements 3.1)
      type: 'local',
      enabled: true,
      // Set timestamps (Requirements 3.4)
      addedAt: now,
      // Single power per local source
      powerCount: 1,
      // Only include path if it has a value (Requirements 3.5)
      ...(power.sourcePath != null && { path: power.sourcePath }),
      lastSync: now,
    }
  }
}
