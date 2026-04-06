import type {
  OutputFileDeclaration,
  OutputWriteContext,
  SkillPrompt
} from './plugin-core'

import {Buffer} from 'node:buffer'
import {AbstractOutputPlugin, filterByProjectConfig} from './plugin-core'

const PROJECT_SKILLS_DIR = '.agents/skills'
const LEGACY_SKILLS_DIR = '.skills'
const LEGACY_AINDEX_SKILLS_DIR = '.aindex/.skills'
const SKILL_FILE_NAME = 'SKILL.md'
const MCP_CONFIG_FILE = 'mcp.json'

type GenericSkillOutputSource
  = | {readonly kind: 'skillMain', readonly skill: SkillPrompt}
    | {readonly kind: 'skillMcp', readonly rawContent: string}
    | {readonly kind: 'skillChildDoc', readonly content: string}
    | {
      readonly kind: 'skillResource'
      readonly content: string
      readonly encoding: 'text' | 'base64'
    }

/**
 * Output plugin that writes skills directly to each project's .agents/skills/ directory.
 *
 * Structure:
 * - Project: <project>/.agents/skills/<skill-name>/SKILL.md, mcp.json, child docs, resources
 *
 * @deprecated Legacy compact skills output. Cleanup must remove the entire
 * global `~/.skills/` directory in addition to the current skill targets.
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
            dirs: [PROJECT_SKILLS_DIR, LEGACY_SKILLS_DIR]
          },
          global: {
            dirs: [PROJECT_SKILLS_DIR, LEGACY_SKILLS_DIR, LEGACY_AINDEX_SKILLS_DIR]
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

  override async declareOutputFiles(
    ctx: OutputWriteContext
  ): Promise<OutputFileDeclaration[]> {
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
      this.getTopicScopeOverride(ctx, 'mcp')
      ?? this.getTopicScopeOverride(ctx, 'skills')
    )

    const pushSkillDeclarations = (
      baseSkillsDir: string,
      scope: 'project' | 'global',
      filteredSkills: readonly SkillPrompt[]
    ): void => {
      this.appendSkillDeclarations(
        declarations,
        baseSkillsDir,
        scope,
        filteredSkills,
        {
          skillSubDir: '',
          buildSkillReferenceSource: childDoc => ({
            kind: 'skillChildDoc',
            content: childDoc.content as string
          })
        }
      )
    }

    const pushMcpDeclarations = (
      baseSkillsDir: string,
      scope: 'project' | 'global',
      filteredMcpSkills: readonly SkillPrompt[]
    ): void => {
      this.appendSkillMcpDeclarations(
        declarations,
        baseSkillsDir,
        scope,
        filteredMcpSkills,
        {
          skillSubDir: '',
          fileName: MCP_CONFIG_FILE,
          buildSkillMcpSource: skill => ({
            kind: 'skillMcp',
            rawContent: skill.mcpConfig?.rawContent ?? ''
          })
        }
      )
    }

    if (
      selectedSkills.selectedScope === 'project'
      || selectedMcpSkills.selectedScope === 'project'
    ) {
      for (const project of this.getProjectOutputProjects(ctx)) {
        const projectRootDir = this.resolveProjectRootDir(ctx, project)
        if (projectRootDir == null) continue

        const filteredSkills = filterByProjectConfig(
          selectedSkills.items,
          project.projectConfig,
          'skills'
        )
        const filteredMcpSkills = filterByProjectConfig(
          selectedMcpSkills.items,
          project.projectConfig,
          'skills'
        )
        const baseSkillsDir = this.joinPath(projectRootDir, PROJECT_SKILLS_DIR)

        if (
          selectedSkills.selectedScope === 'project'
          && filteredSkills.length > 0
        )
        { pushSkillDeclarations(baseSkillsDir, 'project', filteredSkills) }

        if (selectedMcpSkills.selectedScope === 'project')
        { pushMcpDeclarations(baseSkillsDir, 'project', filteredMcpSkills) }
      }
    }

    if (
      selectedSkills.selectedScope !== 'global'
      && selectedMcpSkills.selectedScope !== 'global'
    )
    { return declarations }

    const baseSkillsDir = this.joinPath(this.getHomeDir(), PROJECT_SKILLS_DIR)
    const promptSourceProjectConfig
      = this.resolvePromptSourceProjectConfig(ctx)
    if (selectedSkills.selectedScope === 'global') {
      const filteredSkills = filterByProjectConfig(
        selectedSkills.items,
        promptSourceProjectConfig,
        'skills'
      )
      if (filteredSkills.length > 0)
      { pushSkillDeclarations(baseSkillsDir, 'global', filteredSkills) }
    }

    if (selectedMcpSkills.selectedScope !== 'global') return declarations

    const filteredMcpSkills = filterByProjectConfig(
      selectedMcpSkills.items,
      promptSourceProjectConfig,
      'skills'
    )
    pushMcpDeclarations(baseSkillsDir, 'global', filteredMcpSkills)
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
        return this.buildMarkdownContent(
          source.skill.content as string,
          frontMatterData,
          ctx
        )
      }
      case 'skillMcp':
        return source.rawContent
      case 'skillChildDoc':
        return source.content
      case 'skillResource':
        return source.encoding === 'base64'
          ? Buffer.from(source.content, 'base64')
          : source.content
      default:
        throw new Error(`Unsupported declaration source for ${this.name}`)
    }
  }
}
