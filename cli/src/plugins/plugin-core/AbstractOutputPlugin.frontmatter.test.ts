import type {CommandPrompt, OutputWriteContext, RulePrompt, SkillPrompt, SubAgentPrompt} from './types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import {describe, expect, it} from 'vitest'
import {createLogger, FilePathKind, PromptKind} from '../plugin-core'
import {AbstractOutputPlugin} from './AbstractOutputPlugin'

class TestFrontMatterOutputPlugin extends AbstractOutputPlugin {
  constructor(options?: ConstructorParameters<typeof AbstractOutputPlugin>[1]) {
    super('TestFrontMatterOutputPlugin', {
      globalConfigDir: '.tool',
      outputFileName: '',
      commands: {
        sourceScopes: ['project'],
        transformFrontMatter: () => ({description: 'command'})
      },
      subagents: {
        sourceScopes: ['project']
      },
      skills: {},
      rules: {
        sourceScopes: ['project']
      },
      ...options
    })
  }

  async renderCommand(cmd: CommandPrompt, ctx: OutputWriteContext): Promise<string> {
    return this.buildCommandContent(cmd, ctx)
  }

  renderSubAgent(agent: SubAgentPrompt, ctx: OutputWriteContext): string {
    return this.buildSubAgentContent(agent, ctx)
  }

  renderSkill(skill: SkillPrompt, ctx: OutputWriteContext): string {
    return this.buildSkillMainContent(skill, ctx)
  }

  renderRule(rule: RulePrompt, ctx: OutputWriteContext): string {
    return this.buildRuleContent(rule, ctx)
  }
}

function createWriteContext(blankLineAfter?: boolean): OutputWriteContext {
  const workspaceBase = path.resolve('tmp/frontmatter-workspace')
  return {
    logger: createLogger('TestFrontMatterOutputPlugin', 'error'),
    fs,
    path,
    glob: {} as never,
    dryRun: true,
    pluginOptions: blankLineAfter == null
      ? {}
      : {
          frontMatter: {
            blankLineAfter
          }
        },
    collectedOutputContext: {
      workspace: {
        directory: {
          pathKind: FilePathKind.Absolute,
          path: workspaceBase,
          getDirectoryName: () => 'workspace'
        },
        projects: []
      }
    }
  } as OutputWriteContext
}

function createCommandPrompt(): CommandPrompt {
  return {
    type: PromptKind.Command,
    content: 'command content',
    length: 15,
    filePathKind: FilePathKind.Relative,
    dir: {
      pathKind: FilePathKind.Relative,
      path: 'dev/build.mdx',
      basePath: path.resolve('tmp/dist/commands'),
      getDirectoryName: () => 'build',
      getAbsolutePath: () => path.resolve('tmp/dist/commands/dev/build.mdx')
    },
    commandPrefix: 'dev',
    commandName: 'build',
    yamlFrontMatter: {
      namingCase: 'kebabCase',
      description: 'Build command'
    },
    markdownContents: []
  } as CommandPrompt
}

function createSubAgentPrompt(): SubAgentPrompt {
  return {
    type: PromptKind.SubAgent,
    content: 'subagent content',
    length: 16,
    filePathKind: FilePathKind.Relative,
    dir: {
      pathKind: FilePathKind.Relative,
      path: 'qa/boot.mdx',
      basePath: path.resolve('tmp/dist/subagents'),
      getDirectoryName: () => 'boot',
      getAbsolutePath: () => path.resolve('tmp/dist/subagents/qa/boot.mdx')
    },
    agentPrefix: 'qa',
    agentName: 'boot',
    canonicalName: 'qa-boot',
    yamlFrontMatter: {
      namingCase: 'kebabCase',
      description: 'subagent desc'
    },
    markdownContents: []
  } as SubAgentPrompt
}

function createSkillPrompt(): SkillPrompt {
  return {
    type: PromptKind.Skill,
    content: 'skill content',
    length: 13,
    filePathKind: FilePathKind.Relative,
    skillName: 'ship-it',
    dir: {
      pathKind: FilePathKind.Relative,
      path: 'skills/ship-it',
      basePath: path.resolve('tmp/dist/skills'),
      getDirectoryName: () => 'ship-it',
      getAbsolutePath: () => path.resolve('tmp/dist/skills/ship-it')
    },
    yamlFrontMatter: {
      namingCase: 'kebabCase',
      name: 'ship-it',
      description: 'Ship release'
    },
    markdownContents: []
  } as SkillPrompt
}

function createRulePrompt(): RulePrompt {
  return {
    type: PromptKind.Rule,
    content: 'rule content',
    length: 12,
    filePathKind: FilePathKind.Relative,
    dir: {
      pathKind: FilePathKind.Relative,
      path: 'rules/frontend.mdx',
      basePath: path.resolve('tmp/dist/rules'),
      getDirectoryName: () => 'frontend',
      getAbsolutePath: () => path.resolve('tmp/dist/rules/frontend.mdx')
    },
    prefix: 'frontend',
    ruleName: 'guard',
    globs: ['src/**'],
    scope: 'project',
    yamlFrontMatter: {
      namingCase: 'kebabCase',
      description: 'Rule desc'
    },
    markdownContents: []
  } as RulePrompt
}

describe('abstract output plugin front matter formatting', () => {
  it('adds a blank line after front matter by default for command/rule/subagent/skill outputs', async () => {
    const plugin = new TestFrontMatterOutputPlugin()
    const ctx = createWriteContext()

    await expect(plugin.renderCommand(createCommandPrompt(), ctx)).resolves.toMatch(/\n---\n\ncommand content$/)
    expect(plugin.renderRule(createRulePrompt(), ctx)).toMatch(/\n---\n\nrule content$/)
    expect(plugin.renderSubAgent(createSubAgentPrompt(), ctx)).toMatch(/\n---\n\nsubagent content$/)
    expect(plugin.renderSkill(createSkillPrompt(), ctx)).toMatch(/\n---\n\nskill content$/)
  })

  it('keeps the derived skill name in raw skill front matter output', () => {
    const plugin = new TestFrontMatterOutputPlugin()
    const ctx = createWriteContext()

    expect(plugin.renderSkill(createSkillPrompt(), ctx)).toContain('name: ship-it')
  })

  it('removes the extra blank line when frontMatter.blankLineAfter is false', async () => {
    const plugin = new TestFrontMatterOutputPlugin()
    const ctx = createWriteContext(false)

    await expect(plugin.renderCommand(createCommandPrompt(), ctx)).resolves.toMatch(/\n---\ncommand content$/)
    expect(plugin.renderRule(createRulePrompt(), ctx)).toMatch(/\n---\nrule content$/)
    expect(plugin.renderSubAgent(createSubAgentPrompt(), ctx)).toMatch(/\n---\nsubagent content$/)
    expect(plugin.renderSkill(createSkillPrompt(), ctx)).toMatch(/\n---\nskill content$/)
  })

  it('keeps the blank line when a plugin opts out of the shared switch', async () => {
    const plugin = new TestFrontMatterOutputPlugin({
      supportsBlankLineAfterFrontMatter: false
    })
    const ctx = createWriteContext(false)

    await expect(plugin.renderCommand(createCommandPrompt(), ctx)).resolves.toMatch(/\n---\n\ncommand content$/)
  })
})
