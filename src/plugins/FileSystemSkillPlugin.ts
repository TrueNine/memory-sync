import type { Logger } from '@/log'
import type { CollectedInputContext, InputPlugin, InputPluginContext, SkillPrompt, SkillYAMLFrontMatter } from '@/types'

import * as path from 'node:path'
import { DEFAULT_SHADOW_SKILL_SOURCE_DIR } from '@/constants'
import { createLogger } from '@/log'
import { parseMarkdown } from '@/markdown'
import {
  FilePathKind,
  PluginKind,
  PromptKind,

} from '@/types'
import { resolveBasePaths, resolvePath } from '@/utils/pathUtils'

export class FileSystemSkillPlugin implements InputPlugin {
  readonly type = PluginKind.Input
  readonly name = 'FileSystemSkillPlugin'
  readonly log: Logger

  constructor() {
    this.log = createLogger(this.name)
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const { userConfigOptions: options, logger } = ctx
    const { workspaceDir, shadowProjectDir } = resolveBasePaths(options)

    const skillDirRaw = options.shadowSkillSourceDir ?? DEFAULT_SHADOW_SKILL_SOURCE_DIR
    const skillDir = resolvePath(skillDirRaw, workspaceDir, shadowProjectDir)

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
