/**
 * Kiro Powers Registry Writer
 *
 * Concrete implementation of RegistryWriter for managing Kiro's powers registry.
 * Manages ~/.kiro/powers/registry.json file.
 *
 * @see Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
 */

import type {ILogger} from '@truenine/plugin-shared'
import type {KiroPowerEntry, KiroPowerSource, KiroPowersRegistry, KiroRepoSource, SkillPrompt} from '@truenine/plugin-shared/types'

import {RegistryWriter} from '@truenine/plugin-output-shared/registry'

/**
 * Registry writer for Kiro powers.
 * Manages ~/.kiro/powers/registry.json file.
 *
 * @see Requirements 4.1, 4.2
 */
export class KiroPowersRegistryWriter extends RegistryWriter<KiroPowerEntry, KiroPowersRegistry> {
  private static readonly REGISTRY_PATH = '~/.kiro/powers/registry.json'

  private static readonly DEFAULT_VERSION = '1.0.0'

  constructor(logger?: ILogger) {
    super(KiroPowersRegistryWriter.REGISTRY_PATH, logger)
  }

  protected createInitialRegistry(): KiroPowersRegistry {
    return {
      version: KiroPowersRegistryWriter.DEFAULT_VERSION,
      powers: {},
      repoSources: {},
      lastUpdated: new Date().toISOString()
    }
  }

  protected getEntryName(entry: KiroPowerEntry): string {
    return entry.name
  }

  protected merge(
    existing: KiroPowersRegistry,
    entries: readonly KiroPowerEntry[]
  ): KiroPowersRegistry {
    const powers = {...existing.powers}
    const repoSources = {...existing.repoSources}

    for (const entry of entries) {
      powers[entry.name] = entry

      const repoSource = this.buildRepoSource(entry)
      const repoId = entry.source.repoId ?? entry.name
      repoSources[repoId] = repoSource
    }

    return {
      version: existing.version,
      powers,
      repoSources,
      ...existing.kiroRecommendedRepo != null && {
        kiroRecommendedRepo: existing.kiroRecommendedRepo
      },
      lastUpdated: existing.lastUpdated
    }
  }

  buildPowerEntry(skill: SkillPrompt, installPath: string): KiroPowerEntry {
    const {yamlFrontMatter, mcpConfig} = skill
    const repoId = this.generateEntryId('local')

    const source: KiroPowerSource = {
      type: 'repo',
      repoId,
      repoName: installPath
    }

    const mcpServerNames = mcpConfig != null
      ? Object.keys(mcpConfig.mcpServers)
      : null

    return {
      name: yamlFrontMatter.name,
      description: yamlFrontMatter.description,
      ...mcpServerNames != null && mcpServerNames.length > 0 && {mcpServers: mcpServerNames},
      ...yamlFrontMatter.author != null && {author: yamlFrontMatter.author},
      keywords: yamlFrontMatter.keywords ?? [],
      ...yamlFrontMatter.displayName != null && {displayName: yamlFrontMatter.displayName},
      installed: true,
      installedAt: new Date().toISOString(),
      installPath,
      source,
      sourcePath: installPath
    }
  }

  private getOfficialRegistry(): KiroPowersRegistry {
    try {
      if (typeof __KIRO_GLOBAL_POWERS_REGISTRY__ !== 'undefined') return JSON.parse(__KIRO_GLOBAL_POWERS_REGISTRY__) as KiroPowersRegistry
    }
    catch {
      this.log.debug('Failed to parse official registry, using empty registry')
    }
    return this.createInitialRegistry()
  }

  unregisterLocalPowers(dryRun?: boolean): boolean {
    const officialRegistry = this.getOfficialRegistry()

    const resetRegistry: KiroPowersRegistry = {
      ...officialRegistry,
      lastUpdated: new Date().toISOString()
    }

    this.log.trace({action: dryRun === true ? 'dryRun' : 'reset', type: 'registry', powerCount: Object.keys(resetRegistry.powers).length})

    return this.write(resetRegistry, dryRun)
  }

  private buildRepoSource(power: KiroPowerEntry): KiroRepoSource {
    const now = new Date().toISOString()

    return {
      name: power.sourcePath ?? power.installPath ?? power.name,
      type: 'local',
      enabled: true,
      addedAt: now,
      powerCount: 1,
      ...power.sourcePath != null && {path: power.sourcePath},
      lastSync: now
    }
  }
}
