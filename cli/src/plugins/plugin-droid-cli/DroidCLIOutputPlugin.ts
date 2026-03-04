import type {
  OutputWriteContext,
  SkillPrompt,
  WriteResult
} from '../plugin-core'
import * as path from 'node:path'
import {AbstractOutputPlugin} from '../plugin-core'

const GLOBAL_MEMORY_FILE = 'AGENTS.md'
const GLOBAL_CONFIG_DIR = '.factory'

export class DroidCLIOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('DroidCLIOutputPlugin', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
      outputFileName: GLOBAL_MEMORY_FILE,
      supportsCommands: true,
      supportsSkills: true
    }) // Droid uses default subdir names
  }

  protected override async writeSkill( // Override writeSkill to preserve simplified front matter logic
    ctx: OutputWriteContext,
    basePath: string,
    skill: SkillPrompt
  ): Promise<WriteResult[]> {
    const results: WriteResult[] = []
    const skillName = skill.yamlFrontMatter?.name ?? skill.dir.getDirectoryName()
    const targetDir = path.join(basePath, this.skillsSubDir, skillName)
    const fullPath = path.join(targetDir, 'SKILL.md')

    const simplifiedFrontMatter = skill.yamlFrontMatter != null // Droid-specific: Simplify front matter
      ? {name: skill.yamlFrontMatter.name, description: skill.yamlFrontMatter.description}
      : void 0

    const content = this.buildMarkdownContent(skill.content as string, simplifiedFrontMatter)

    const mainFileResult = await this.writeFile(ctx, fullPath, content, 'skill')
    results.push(mainFileResult)

    if (skill.childDocs != null) {
      for (const refDoc of skill.childDocs) {
        const refResults = await this.writeSkillReferenceDocument(ctx, targetDir, skillName, {dir: refDoc.dir.path, content: refDoc.content}, basePath)
        results.push(...refResults)
      }
    }

    if (skill.resources != null) {
      for (const resource of skill.resources) {
        const refResults = await this.writeSkillResource(ctx, targetDir, skillName, resource, basePath)
        results.push(...refResults)
      }
    }

    return results
  }
}
