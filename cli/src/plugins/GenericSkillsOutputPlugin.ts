import type {
  OutputFileDeclaration,
  OutputWriteContext,
  SkillPrompt
} from './plugin-core'

import {Buffer} from 'node:buffer'
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
      treatWorkspaceRootProjectAsProject: true,
      skills: {},
      cleanup: {
        delete: {
          project: {
            dirs: [PROJECT_SKILLS_DIR]
          },
          global: {
            dirs: [PROJECT_SKILLS_DIR]
          }
        }
      },
      capabilities: {
        skills: {
          scopes: ['project', 'global'],
          singleScope: true
        },
        mcp: {
          scopes: ['project', 'global'],
          singleScope: true
        }
      }
    })
  }

  override async declareOutputFiles(ctx: OutputWriteContext): Promise<OutputFileDeclaration[]> {
    const declarations: OutputFileDeclaration[] = []
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

    const pushSkillDeclarations = (
      baseSkillsDir: string,
      scope: 'project' | 'global',
      filteredSkills: readonly SkillPrompt[]
    ): void => {
      for (const skill of filteredSkills) {
        const skillName = skill.yamlFrontMatter.name
        const skillDir = this.joinPath(baseSkillsDir, skillName)

        declarations.push({
          path: this.joinPath(skillDir, SKILL_FILE_NAME),
          scope,
          source: {kind: 'skillMain', skill} satisfies GenericSkillOutputSource
        })

        if (skill.childDocs != null) {
          for (const childDoc of skill.childDocs) {
            declarations.push({
              path: this.joinPath(skillDir, childDoc.relativePath.replace(/\.mdx$/, '.md')),
              scope,
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
              scope,
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

    const pushMcpDeclarations = (
      baseSkillsDir: string,
      scope: 'project' | 'global',
      filteredMcpSkills: readonly SkillPrompt[]
    ): void => {
      for (const skill of filteredMcpSkills) {
        if (skill.mcpConfig == null) continue

        declarations.push({
          path: this.joinPath(baseSkillsDir, skill.yamlFrontMatter.name, MCP_CONFIG_FILE),
          scope,
          source: {
            kind: 'skillMcp',
            rawContent: skill.mcpConfig.rawContent
          } satisfies GenericSkillOutputSource
        })
      }
    }

    if (selectedSkills.selectedScope === 'project' || selectedMcpSkills.selectedScope === 'project') {
      for (const project of this.getProjectOutputProjects(ctx)) {
        const projectRootDir = this.resolveProjectRootDir(ctx, project)
        if (projectRootDir == null) continue

        const filteredSkills = filterByProjectConfig(selectedSkills.items, project.projectConfig, 'skills')
        const filteredMcpSkills = filterByProjectConfig(selectedMcpSkills.items, project.projectConfig, 'skills')
        const baseSkillsDir = this.joinPath(projectRootDir, PROJECT_SKILLS_DIR)

        if (selectedSkills.selectedScope === 'project' && filteredSkills.length > 0) pushSkillDeclarations(baseSkillsDir, 'project', filteredSkills)

        if (selectedMcpSkills.selectedScope === 'project') pushMcpDeclarations(baseSkillsDir, 'project', filteredMcpSkills)
      }
    }

    if (
      selectedSkills.selectedScope !== 'global'
      && selectedMcpSkills.selectedScope !== 'global'
    ) return declarations

    const baseSkillsDir = this.joinPath(this.getHomeDir(), PROJECT_SKILLS_DIR)
    const promptSourceProjectConfig = this.resolvePromptSourceProjectConfig(ctx)
    if (selectedSkills.selectedScope === 'global') {
      const filteredSkills = filterByProjectConfig(selectedSkills.items, promptSourceProjectConfig, 'skills')
      if (filteredSkills.length > 0) pushSkillDeclarations(baseSkillsDir, 'global', filteredSkills)
    }

    if (selectedMcpSkills.selectedScope === 'global') {
      const filteredMcpSkills = filterByProjectConfig(selectedMcpSkills.items, promptSourceProjectConfig, 'skills')
      pushMcpDeclarations(baseSkillsDir, 'global', filteredMcpSkills)
    }

    return declarations
  }

  override async convertContent(
    declaration: OutputFileDeclaration,
    ctx: OutputWriteContext
  ): Promise<string | Buffer> {
    const source = declaration.source as GenericSkillOutputSource
    switch (source.kind) {
      case 'skillMain': {
        const frontMatterData = this.buildSkillFrontMatter(source.skill)
        return this.buildMarkdownContent(source.skill.content as string, frontMatterData, ctx)
      }
      case 'skillMcp': return source.rawContent
      case 'skillChildDoc': return source.content
      case 'skillResource': return source.encoding === 'base64' ? Buffer.from(source.content, 'base64') : source.content
      default: throw new Error(`Unsupported declaration source for ${this.name}`)
    }
  }
}
