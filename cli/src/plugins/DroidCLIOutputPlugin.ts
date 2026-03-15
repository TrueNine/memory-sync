import type {
  OutputWriteContext,
  SkillPrompt
} from './plugin-core'
import {AbstractOutputPlugin} from './plugin-core'

const GLOBAL_MEMORY_FILE = 'AGENTS.md'
const GLOBAL_CONFIG_DIR = '.factory'

export class DroidCLIOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('DroidCLIOutputPlugin', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
      outputFileName: GLOBAL_MEMORY_FILE,
      commands: {
        transformFrontMatter: (_cmd, context) => context.sourceFrontMatter ?? {}
      },
      skills: {},
      cleanup: {
        delete: {
          project: {
            files: [GLOBAL_MEMORY_FILE],
            dirs: ['.factory/commands', '.factory/skills']
          },
          workspace: {
            dirs: ['.factory/commands', '.factory/skills']
          },
          global: {
            files: ['.factory/AGENTS.md'],
            dirs: ['.factory/commands', '.factory/skills']
          }
        }
      },
      capabilities: {
        prompt: {
          scopes: ['project', 'global'],
          singleScope: false
        },
        commands: {
          scopes: ['project', 'workspace', 'global'],
          singleScope: true
        },
        skills: {
          scopes: ['project', 'workspace', 'global'],
          singleScope: true
        }
      }
    }) // Droid uses default subdir names
  }

  protected override buildSkillMainContent(skill: SkillPrompt, ctx?: OutputWriteContext): string { // Droid-specific: Simplify front matter
    const simplifiedFrontMatter = skill.yamlFrontMatter != null // Droid-specific: Simplify front matter
      ? {name: skill.yamlFrontMatter.name, description: skill.yamlFrontMatter.description}
      : void 0

    return this.buildMarkdownContent(skill.content as string, simplifiedFrontMatter, ctx)
  }
}
