import type {OutputWriteContext} from '@truenine/plugin-shared'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {createMockProject, createMockRulePrompt} from '@truenine/plugin-shared'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {QoderIDEPluginOutputPlugin} from './QoderIDEPluginOutputPlugin'

class TestableQoderIDEPlugin extends QoderIDEPluginOutputPlugin {
  private mockHomeDir: string | null = null
  public setMockHomeDir(dir: string | null): void { this.mockHomeDir = dir }
  protected override getHomeDir(): string { return this.mockHomeDir ?? super.getHomeDir() }
}

function createMockWriteContext(tempDir: string, rules: unknown[], projects: unknown[]): OutputWriteContext {
  return {
    collectedInputContext: {
      workspace: {
        projects: projects as never,
        directory: {pathKind: 1, path: tempDir, basePath: tempDir, getDirectoryName: () => 'workspace', getAbsolutePath: () => tempDir}
      },
      ideConfigFiles: [],
      rules: rules as never,
      fastCommands: [],
      skills: [],
      globalMemory: void 0,
      aiAgentIgnoreConfigFiles: []
    },
    dryRun: false,
    logger: {debug: vi.fn(), trace: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn()} as never,
    fs,
    path,
    glob: vi.fn() as never
  }
}

describe('qoderIDEPluginOutputPlugin - projectConfig filtering', () => {
  let tempDir: string, plugin: TestableQoderIDEPlugin

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qoder-proj-config-test-'))
    plugin = new TestableQoderIDEPlugin()
    plugin.setMockHomeDir(tempDir)
  })

  afterEach(() => {
    try {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
    catch {}
  })

  function ruleFile(projectPath: string, series: string, ruleName: string): string {
    return path.join(tempDir, projectPath, '.qoder', 'rules', `rule-${series}-${ruleName}.md`)
  }

  describe('writeProjectOutputs', () => {
    it('should write all project rules when no projectConfig', async () => {
      const rules = [
        createMockRulePrompt('test', 'rule1', 'uniapp', 'project'),
        createMockRulePrompt('test', 'rule2', 'vue', 'project')
      ]
      await plugin.writeProjectOutputs(createMockWriteContext(tempDir, rules, [createMockProject('proj1', tempDir, 'proj1')]))

      expect(fs.existsSync(ruleFile('proj1', 'test', 'rule1'))).toBe(true)
      expect(fs.existsSync(ruleFile('proj1', 'test', 'rule2'))).toBe(true)
    })

    it('should only write rules matching include filter', async () => {
      const rules = [
        createMockRulePrompt('test', 'rule1', 'uniapp', 'project'),
        createMockRulePrompt('test', 'rule2', 'vue', 'project')
      ]
      await plugin.writeProjectOutputs(createMockWriteContext(tempDir, rules, [
        createMockProject('proj1', tempDir, 'proj1', {rules: {includeSeries: ['uniapp']}})
      ]))

      expect(fs.existsSync(ruleFile('proj1', 'test', 'rule1'))).toBe(true)
      expect(fs.existsSync(ruleFile('proj1', 'test', 'rule2'))).toBe(false)
    })

    it('should not write rules not matching includeSeries filter', async () => {
      const rules = [
        createMockRulePrompt('test', 'rule1', 'uniapp', 'project'),
        createMockRulePrompt('test', 'rule2', 'vue', 'project')
      ]
      await plugin.writeProjectOutputs(createMockWriteContext(tempDir, rules, [
        createMockProject('proj1', tempDir, 'proj1', {rules: {includeSeries: ['vue']}})
      ]))

      expect(fs.existsSync(ruleFile('proj1', 'test', 'rule1'))).toBe(false)
      expect(fs.existsSync(ruleFile('proj1', 'test', 'rule2'))).toBe(true)
    })

    it('should write rules without seriName regardless of include filter', async () => {
      const rules = [
        createMockRulePrompt('test', 'rule1', void 0, 'project'),
        createMockRulePrompt('test', 'rule2', 'vue', 'project')
      ]
      await plugin.writeProjectOutputs(createMockWriteContext(tempDir, rules, [
        createMockProject('proj1', tempDir, 'proj1', {rules: {includeSeries: ['uniapp']}})
      ]))

      expect(fs.existsSync(ruleFile('proj1', 'test', 'rule1'))).toBe(true)
      expect(fs.existsSync(ruleFile('proj1', 'test', 'rule2'))).toBe(false)
    })

    it('should write expanded glob when subSeries matches seriName', async () => {
      const rules = [createMockRulePrompt('test', 'rule1', 'uniapp', 'project')]
      await plugin.writeProjectOutputs(createMockWriteContext(tempDir, rules, [
        createMockProject('proj1', tempDir, 'proj1', {rules: {subSeries: {applet: ['uniapp']}}})
      ]))

      const content = fs.readFileSync(ruleFile('proj1', 'test', 'rule1'), 'utf8')
      expect(content).toContain('applet/')
    })
  })
})
