/**
 * Integration tests for compiler integration with plugin pipeline.
 *
 * Tests the complete flow from configuration loading to MDX compilation,
 * including multi-plugin scope registration and merging.
 *
 * @see Requirements 5.1, 5.2, 5.3, 5.5
 */

import type { MdxGlobalScope } from '@/globals'
import type { CollectedInputContext, InputPluginContext, PluginOptions } from '@/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import glob from 'fast-glob'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { registerBuiltInComponents } from '../components'
import { ShellKind } from '../globals'
import { createLogger } from '../log'
import { AbstractInputPlugin } from '../plugins/AbstractInputPlugin'
import { GlobalScopeCollector, ScopePriority, ScopeRegistry } from '../scope'
import { clearComponents } from './component-registry'
import { mdxToMd } from './mdx-to-md'

/**
 * Mock input plugin for testing scope registration
 */
class MockScopePlugin extends AbstractInputPlugin {
  private readonly scopeNamespace: string
  private readonly scopeValues: Record<string, unknown>

  constructor(name: string, namespace: string, values: Record<string, unknown>, dependsOn?: readonly string[]) {
    super(name, dependsOn)
    this.scopeNamespace = namespace
    this.scopeValues = values
  }

  collect(_ctx: InputPluginContext): Partial<CollectedInputContext> {
    // Register scope during collection
    this.registerScope(this.scopeNamespace, this.scopeValues)
    return {}
  }
}

describe('compiler Integration', () => {
  beforeEach(() => {
    registerBuiltInComponents()
  })

  afterEach(() => {
    clearComponents()
  })

  describe('globalScopeCollector integration', () => {
    it('should collect complete global scope with all namespaces', () => {
      const collector = new GlobalScopeCollector()
      const scope = collector.collect()

      // Verify os namespace has required properties
      expect(scope.os).toBeDefined()
      expect(scope.os.platform).toBeDefined()
      expect(scope.os.arch).toBeDefined()
      expect(scope.os.hostname).toBeDefined()
      expect(scope.os.homedir).toBeDefined()
      expect(scope.os.tmpdir).toBeDefined()
      expect(scope.os.type).toBeDefined()
      expect(scope.os.release).toBeDefined()
      expect(scope.os.shellKind).toBeDefined()

      // Verify env namespace exists
      expect(scope.env).toBeDefined()
      expect(typeof scope.env).toBe('object')

      // Verify profile namespace exists (empty by default)
      expect(scope.profile).toBeDefined()
      expect(typeof scope.profile).toBe('object')

      // Verify tool namespace has defaults
      expect(scope.tool).toBeDefined()
      expect(scope.tool.websearch).toBe('web_search')
      expect(scope.tool.webfetch).toBe('web_fetch')
    })

    it('should merge user config profile into global scope', () => {
      const userConfig = {
        profile: {
          name: 'Test User',
          username: 'testuser',
          customField: 'custom value',
        },
      }

      const collector = new GlobalScopeCollector({ userConfig })
      const scope = collector.collect()

      expect(scope.profile.name).toBe('Test User')
      expect(scope.profile.username).toBe('testuser')
      expect(scope.profile['customField']).toBe('custom value')
    })

    it('should use system default tool references (not user configurable)', () => {
      // tool is no longer user-configurable, it uses system defaults
      // Output plugins may override these values for specific AI tools
      const collector = new GlobalScopeCollector()
      const scope = collector.collect()

      // System defaults should be used
      expect(scope.tool.websearch).toBe('web_search')
      expect(scope.tool.webfetch).toBe('web_fetch')
    })
  })

  describe('scopeRegistry integration', () => {
    it('should merge scopes with correct priority order', () => {
      const registry = new ScopeRegistry()

      // Set global scope (lowest priority)
      const globalScope: MdxGlobalScope = {
        os: { platform: 'linux', shellKind: ShellKind.Bash },
        env: { NODE_ENV: 'test' },
        profile: { name: 'Global User' },
        tool: { websearch: 'global_search' },
      }
      registry.setGlobalScope(globalScope)

      // Register user config scope
      registry.register('profile', { name: 'Config User', role: 'developer' }, ScopePriority.UserConfig)

      // Register plugin scope
      registry.register('profile', { name: 'Plugin User', team: 'engineering' }, ScopePriority.PluginRegistered)

      // Merge with compile-time scope
      const compileTimeScope = { profile: { name: 'Compile User' } }
      const merged = registry.merge(compileTimeScope)

      // Compile-time should win for 'name'
      expect((merged['profile'] as Record<string, unknown>)['name']).toBe('Compile User')
      // Plugin scope should provide 'team'
      expect((merged['profile'] as Record<string, unknown>)['team']).toBe('engineering')
      // User config should provide 'role'
      expect((merged['profile'] as Record<string, unknown>)['role']).toBe('developer')
    })

    it('should deep merge nested objects', () => {
      const registry = new ScopeRegistry()

      registry.register('config', {
        database: { host: 'localhost', port: 5432 },
        cache: { enabled: true },
      }, ScopePriority.SystemDefault)

      registry.register('config', {
        database: { port: 3306, name: 'mydb' },
      }, ScopePriority.UserConfig)

      const merged = registry.merge()
      const config = merged['config'] as Record<string, unknown>
      const database = config['database'] as Record<string, unknown>

      // Deep merge should preserve host from first registration
      expect(database['host']).toBe('localhost')
      // Deep merge should override port from second registration
      expect(database['port']).toBe(3306)
      // Deep merge should add name from second registration
      expect(database['name']).toBe('mydb')
      // Cache should be preserved
      expect((config['cache'] as Record<string, unknown>)['enabled']).toBe(true)
    })
  })

  describe('mdxToMd with global scope', () => {
    it('should evaluate expressions using global scope', async () => {
      const globalScope: MdxGlobalScope = {
        os: { platform: 'linux', arch: 'x64', shellKind: ShellKind.Bash },
        env: { NODE_ENV: 'production' },
        profile: { name: 'Test User', username: 'testuser' },
        tool: { websearch: 'web_search', webfetch: 'web_fetch' },
      }

      const content = `# Hello {profile.name}

Platform: {os.platform}
Environment: {env.NODE_ENV}
Search Tool: {tool.websearch}`

      const result = await mdxToMd(content, { globalScope })

      expect(result).toContain('# Hello Test User')
      expect(result).toContain('Platform: linux')
      expect(result).toContain('Environment: production')
      expect(result).toContain('Search Tool: web_search')
    })

    it('should allow custom scope to override global scope', async () => {
      const globalScope: MdxGlobalScope = {
        os: { platform: 'linux', shellKind: ShellKind.Bash },
        env: {},
        profile: { name: 'Global User' },
        tool: { websearch: 'global_search' },
      }

      const customScope = {
        profile: { name: 'Custom User' },
      }

      const content = `Hello {profile.name}`

      const result = await mdxToMd(content, { globalScope, scope: customScope })

      // Custom scope should override global scope
      expect(result).toContain('Hello Custom User')
    })

    it('should extract metadata while using global scope', async () => {
      const globalScope: MdxGlobalScope = {
        os: { platform: 'darwin', shellKind: ShellKind.Zsh },
        env: {},
        profile: { name: 'Test User' },
        tool: {},
      }

      const content = `export const name = "test-skill"
export const description = "A test skill"

# Hello {profile.name}

This skill runs on {os.platform}.`

      const result = await mdxToMd(content, { globalScope, extractMetadata: true })

      // Content should have expressions evaluated
      expect(result.content).toContain('# Hello Test User')
      expect(result.content).toContain('This skill runs on darwin.')

      // Metadata should be extracted
      expect(result.metadata.fields['name']).toBe('test-skill')
      expect(result.metadata.fields['description']).toBe('A test skill')
      expect(result.metadata.source).toBe('export')

      // Export statements should be removed
      expect(result.content).not.toContain('export const')
    })
  })

  describe('multi-plugin scope registration', () => {
    it('should collect scopes from multiple plugins', () => {
      const plugin1 = new MockScopePlugin('plugin1', 'plugin1', { version: '1.0.0', name: 'Plugin One' })
      const plugin2 = new MockScopePlugin('plugin2', 'plugin2', { version: '2.0.0', name: 'Plugin Two' })

      const logger = createLogger('test')
      const ctx: InputPluginContext = {
        logger,
        fs,
        path,
        glob,
        userConfigOptions: {} as Required<PluginOptions>,
        dependencyContext: {},
      }

      // Execute plugins
      plugin1.collect(ctx)
      plugin2.collect(ctx)

      // Get registered scopes
      const scopes1 = plugin1.getRegisteredScopes()
      const scopes2 = plugin2.getRegisteredScopes()

      expect(scopes1).toHaveLength(1)
      expect(scopes1[0]?.namespace).toBe('plugin1')
      expect(scopes1[0]?.values['version']).toBe('1.0.0')

      expect(scopes2).toHaveLength(1)
      expect(scopes2[0]?.namespace).toBe('plugin2')
      expect(scopes2[0]?.values['version']).toBe('2.0.0')
    })

    it('should merge scopes from multiple plugins into registry', () => {
      const plugin1 = new MockScopePlugin('plugin1', 'shared', { key1: 'value1', common: 'from-plugin1' })
      const plugin2 = new MockScopePlugin('plugin2', 'shared', { key2: 'value2', common: 'from-plugin2' })

      const logger = createLogger('test')
      const ctx: InputPluginContext = {
        logger,
        fs,
        path,
        glob,
        userConfigOptions: {} as Required<PluginOptions>,
        dependencyContext: {},
      }

      // Execute plugins
      plugin1.collect(ctx)
      plugin2.collect(ctx)

      // Create registry and register scopes
      const registry = new ScopeRegistry()

      for (const { namespace, values } of plugin1.getRegisteredScopes()) {
        registry.register(namespace, values, ScopePriority.PluginRegistered)
      }

      for (const { namespace, values } of plugin2.getRegisteredScopes()) {
        registry.register(namespace, values, ScopePriority.PluginRegistered)
      }

      const merged = registry.merge()
      const shared = merged['shared'] as Record<string, unknown>

      // Both keys should be present
      expect(shared['key1']).toBe('value1')
      expect(shared['key2']).toBe('value2')
      // Later registration should override common key
      expect(shared['common']).toBe('from-plugin2')
    })

    it('should integrate plugin scopes with global scope in MDX compilation', async () => {
      // Create global scope
      const globalScope: MdxGlobalScope = {
        os: { platform: 'linux', shellKind: ShellKind.Bash },
        env: { NODE_ENV: 'test' },
        profile: { name: 'Test User' },
        tool: { websearch: 'search' },
      }

      // Create registry with global scope
      const registry = new ScopeRegistry()
      registry.setGlobalScope(globalScope)

      // Register plugin scopes
      registry.register('plugin1', { version: '1.0.0' }, ScopePriority.PluginRegistered)
      registry.register('plugin2', { feature: 'enabled' }, ScopePriority.PluginRegistered)

      // Merge all scopes
      const mergedScope = registry.merge()

      // Compile MDX with merged scope
      const content = `# {profile.name}'s Dashboard

Platform: {os.platform}
Plugin1 Version: {plugin1.version}
Plugin2 Feature: {plugin2.feature}`

      const result = await mdxToMd(content, { scope: mergedScope })

      expect(result).toContain('# Test User\'s Dashboard')
      expect(result).toContain('Platform: linux')
      expect(result).toContain('Plugin1 Version: 1.0.0')
      expect(result).toContain('Plugin2 Feature: enabled')
    })
  })

  describe('complete configuration to compilation flow', () => {
    it('should flow from user config through scope collection to MDX compilation', async () => {
      // Step 1: User configuration (tool is no longer user-configurable)
      const userConfig = {
        profile: {
          name: 'John Doe',
          username: 'johndoe',
          role: 'developer',
        },
      }

      // Step 2: Collect global scope
      const collector = new GlobalScopeCollector({ userConfig })
      const globalScope = collector.collect()

      // Step 3: Create registry and set global scope
      const registry = new ScopeRegistry()
      registry.setGlobalScope(globalScope)

      // Step 4: Simulate plugin scope registration
      registry.register('myPlugin', {
        version: '3.0.0',
        config: { debug: true, timeout: 5000 },
      }, ScopePriority.PluginRegistered)

      // Step 5: Merge all scopes
      const mergedScope = registry.merge()

      // Step 6: Compile MDX with full scope (using system default tool references)
      const mdxContent = `export const name = "my-skill"
export const description = "A skill for {profile.username}"

# Welcome, {profile.name}!

Your role: {profile.role}
Search tool: {tool.websearch}
Fetch tool: {tool.webfetch}
Plugin version: {myPlugin.version}
Debug mode: {myPlugin.config.debug}`

      const result = await mdxToMd(mdxContent, {
        scope: mergedScope,
        extractMetadata: true,
      })

      // Verify content compilation
      expect(result.content).toContain('# Welcome, John Doe!')
      expect(result.content).toContain('Your role: developer')
      expect(result.content).toContain('Search tool: web_search')
      expect(result.content).toContain('Fetch tool: web_fetch')
      expect(result.content).toContain('Plugin version: 3.0.0')
      expect(result.content).toContain('Debug mode: true')

      // Verify metadata extraction
      expect(result.metadata.fields['name']).toBe('my-skill')
      expect(result.metadata.fields['description']).toBe('A skill for {profile.username}')
      expect(result.metadata.source).toBe('export')

      // Verify exports are removed
      expect(result.content).not.toContain('export const')
    })

    it('should handle empty user config gracefully', async () => {
      // No user config
      const collector = new GlobalScopeCollector()
      const globalScope = collector.collect()

      const registry = new ScopeRegistry()
      registry.setGlobalScope(globalScope)

      const mergedScope = registry.merge()

      const content = `Platform: {os.platform}
Default search: {tool.websearch}`

      const result = await mdxToMd(content, { scope: mergedScope })

      // Should use system defaults
      expect(result).toContain('Platform:')
      expect(result).toContain('Default search: web_search')
    })

    it('should preserve scope isolation between compilations', async () => {
      const globalScope: MdxGlobalScope = {
        os: { platform: 'linux', shellKind: ShellKind.Bash },
        env: {},
        profile: { name: 'User' },
        tool: {},
      }

      // First compilation with custom scope
      const result1 = await mdxToMd('Hello {profile.name}', {
        globalScope,
        scope: { profile: { name: 'Custom User' } },
      })

      // Second compilation without custom scope
      const result2 = await mdxToMd('Hello {profile.name}', {
        globalScope,
      })

      // First should use custom scope
      expect(result1).toContain('Hello Custom User')
      // Second should use global scope (not affected by first)
      expect(result2).toContain('Hello User')
    })
  })

  describe('edge cases', () => {
    it('should handle undefined values in scope gracefully', async () => {
      const globalScope: MdxGlobalScope = {
        os: { platform: 'linux', shellKind: ShellKind.Bash },
        env: {},
        profile: {},
        tool: {},
      }

      // This should not throw, undefined values are handled
      const content = `Platform: {os.platform}`
      const result = await mdxToMd(content, { globalScope })

      expect(result).toContain('Platform: linux')
    })

    it('should handle deeply nested scope values', async () => {
      const scope = {
        config: {
          database: {
            connection: {
              host: 'localhost',
              port: 5432,
            },
          },
        },
      }

      const content = `Host: {config.database.connection.host}
Port: {config.database.connection.port}`

      const result = await mdxToMd(content, { scope })

      expect(result).toContain('Host: localhost')
      expect(result).toContain('Port: 5432')
    })

    it('should handle array values in scope', async () => {
      const scope = {
        tags: ['typescript', 'testing', 'integration'],
        config: {
          features: ['feature1', 'feature2'],
        },
      }

      // Arrays are converted to string representation
      const content = `Tags: {tags}`
      const result = await mdxToMd(content, { scope })

      expect(result).toContain('Tags:')
    })
  })
})
