import type { CollectedInputContext, InputPluginContext, SkillPrompt, SkillYAMLFrontMatter } from '@/types'

import * as path from 'node:path'
import { DEFAULT_SHADOW_SKILL_SOURCE_DIR } from '@/constants'
import { parseMarkdown } from '@/markdown'
import {
  FilePathKind,
  PromptKind,
} from '@/types'
import { AbstractInputPlugin } from './AbstractInputPlugin'

export class SkillInputPlugin extends AbstractInputPlugin {
  constructor() {
    super('SkillInputPlugin')
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const { userConfigOptions: options, logger } = ctx
    const { workspaceDir, shadowProjectDir } = this.resolveBasePaths(options)

    const skillDirRaw = options.shadowSkillSourceDir ?? DEFAULT_SHADOW_SKILL_SOURCE_DIR
    const skillDir = this.resolvePath(skillDirRaw, workspaceDir, shadowProjectDir)

    const skills: SkillPrompt[] = []
    if (ctx.fs.existsSync(skillDir) && ctx.fs.statSync(skillDir).isDirectory()) {
      try {
        const entries = ctx.fs.readdirSync(skillDir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const skillFilePath = ctx.path.join(skillDir, entry.name, 'SKILL.md')
            if (ctx.fs.existsSync(skillFilePath) && ctx.fs.statSync(skillFilePath).isFile()) {
              const rawContent = ctx.fs.readFileSync(skillFilePath, 'utf-8')
              const parsed = parseMarkdown<SkillYAMLFrontMatter>(rawContent)
              const content = parsed.contentWithoutFrontMatter
              skills.push({
                type: PromptKind.Skill,
                content,
                length: content.length,
                filePathKind: FilePathKind.Relative,
                yamlFrontMatter: parsed.yamlFrontMatter ?? { name: entry.name, description: '' } as SkillYAMLFrontMatter,
                ...(parsed.rawFrontMatter != null && { rawFrontMatter: parsed.rawFrontMatter }),
                markdownAst: parsed.markdownAst,
                markdownContents: parsed.markdownContents,
                dir: {
                  pathKind: FilePathKind.Relative,
                  path: entry.name,
                  basePath: skillDir,
                  getDirectoryName: () => entry.name,
                  getAbsolutePath: () => path.join(skillDir, entry.name),
                },
              })
            }
          }
        }
      } catch (e) {
        logger.error(`Failed to scan skills at ${skillDir}`, { error: e })
      }
    }

    return { skills }
  }
}
