import type {
  OutputFileDeclaration,
  OutputWriteContext,
  SkillPrompt
} from './plugin-core'

import {Buffer} from 'node:buffer'
import {buildMarkdownWithFrontMatter} from '@truenine/md-compiler/markdown'
import {AbstractOutputPlugin, filterByProjectConfig} from './plugin-core'

const PROJECT_SKILLS_DIR = '.agents/skills'
const SKILL_FILE_NAME = 'SKILL.md'
const MCP_CONFIG_FILE = 'mcp.json'

type GenericSkillOutputSource
  = {readonly kind: 'skillMain', readonly skill: SkillPrompt}
    | {readonly kind: 'skillMcp', readonly rawContent: string}
    | {readonly kind: 'skillChildDoc', readonly content: string}
    | {readonly kind: 'skillResource', readonly content: string, readonly encoding: 'text' | 'base64'}

/**
 * Output plugin that writes skills directly to each project's .agents/skills/ directory.
 *
 * Structure:
 * - Project: <project>/.agents/skills/<skill-name>/SKILL.md, mcp.json, child docs, resources
 */
export class GenericSkillsOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('GenericSkillsOutputPlugin', {
      outputFileName: SKILL_FILE_NAME,
      skills: {},
      cleanup: {
        delete: {
          project: {
            dirs: [PROJECT_SKILLS_DIR]
          }
        }
      },
      capabilities: {
        skills: {
          scopes: ['project', 'workspace', 'global'],
          singleScope: true
        },
        mcp: {
          scopes: ['project', 'workspace', 'global'],
          singleScope: true
        }
      }
    })
  }

  override async declareOutputFiles(ctx: OutputWriteContext): Promise<OutputFileDeclaration[]> {
    const declarations: OutputFileDeclaration[] = []
    const {projects} = ctx.collectedOutputContext.workspace
    const {skills} = ctx.collectedOutputContext

    if (skills == null || skills.length === 0) return declarations

    const selectedSkills = this.selectSingleScopeItems(
      skills,
      this.skillsConfig.sourceScopes,
      skill => this.resolveSkillSourceScope(skill),
      this.getTopicScopeOverride(ctx, 'skills')
    )
    const selectedMcpSkills = this.selectSingleScopeItems(
      skills,
      this.skillsConfig.sourceScopes,
      skill => this.resolveSkillSourceScope(skill),
      this.getTopicScopeOverride(ctx, 'mcp') ?? this.getTopicScopeOverride(ctx, 'skills')
    )

    for (const project of projects) {
      const projectDir = project.dirFromWorkspacePath
      if (projectDir == null) continue

      const filteredSkills = filterByProjectConfig(selectedSkills.items, project.projectConfig, 'skills')
      const filteredMcpSkills = filterByProjectConfig(selectedMcpSkills.items, project.projectConfig, 'skills')
      if (filteredSkills.length === 0) continue

      const projectSkillsDir = this.joinPath(
        projectDir.basePath,
        projectDir.path,
        PROJECT_SKILLS_DIR
      )

      for (const skill of filteredSkills) {
        const skillName = skill.yamlFrontMatter.name
        const skillDir = this.joinPath(projectSkillsDir, skillName)

        declarations.push({
          path: this.joinPath(skillDir, SKILL_FILE_NAME),
          scope: 'project',
          source: {kind: 'skillMain', skill} satisfies GenericSkillOutputSource
        })

        if (skill.mcpConfig != null && filteredMcpSkills.includes(skill)) {
          declarations.push({
            path: this.joinPath(skillDir, MCP_CONFIG_FILE),
            scope: 'project',
            source: {
              kind: 'skillMcp',
              rawContent: skill.mcpConfig.rawContent
            } satisfies GenericSkillOutputSource
          })
        }

        if (skill.childDocs != null) {
          for (const childDoc of skill.childDocs) {
            declarations.push({
              path: this.joinPath(skillDir, childDoc.relativePath.replace(/\.mdx$/, '.md')),
              scope: 'project',
              source: {
                kind: 'skillChildDoc',
                content: childDoc.content as string
              } satisfies GenericSkillOutputSource
            })
          }
        }

        if (skill.resources != null) {
          for (const resource of skill.resources) {
            declarations.push({
              path: this.joinPath(skillDir, resource.relativePath),
              scope: 'project',
              source: {
                kind: 'skillResource',
                content: resource.content,
                encoding: resource.encoding
              } satisfies GenericSkillOutputSource
            })
          }
        }
      }
    }

    return declarations
  }

  override async convertContent(
    declaration: OutputFileDeclaration,
    _ctx: OutputWriteContext
  ): Promise<string | Buffer> {
    const source = declaration.source as GenericSkillOutputSource
    switch (source.kind) {
      case 'skillMain': {
        const frontMatterData = this.buildSkillFrontMatter(source.skill)
        return buildMarkdownWithFrontMatter(frontMatterData, source.skill.content as string)
      }
      case 'skillMcp': return source.rawContent
      case 'skillChildDoc': return source.content
      case 'skillResource': return source.encoding === 'base64' ? Buffer.from(source.content, 'base64') : source.content
      default: throw new Error(`Unsupported declaration source for ${this.name}`)
    }
  }
}
