import type {
  OutputFileDeclaration,
  OutputWriteContext
} from './plugin-core'
import {AbstractOutputPlugin} from './plugin-core'

const PROJECT_MEMORY_FILE = 'AGENTS.md'

export class AgentsOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('AgentsOutputPlugin', {
      outputFileName: PROJECT_MEMORY_FILE,
      cleanup: {
        delete: {
          project: {
            files: [PROJECT_MEMORY_FILE]
          }
        }
      },
      capabilities: {
        prompt: {
          scopes: ['project'],
          singleScope: false
        }
      }
    })
  }

  override async declareOutputFiles(ctx: OutputWriteContext): Promise<OutputFileDeclaration[]> {
    const results: OutputFileDeclaration[] = []
    const {projects} = ctx.collectedOutputContext.workspace
    const activePromptScopes = new Set(this.selectPromptScopes(ctx, ['project']))
    if (!activePromptScopes.has('project')) return results

    for (const [projectIndex, project] of projects.entries()) {
      if (project.rootMemoryPrompt != null && project.dirFromWorkspacePath != null) {
        results.push({
          path: this.resolveFullPath(project.dirFromWorkspacePath),
          scope: 'project',
          source: {type: 'projectRootMemory', projectIndex}
        })
      }

      if (project.childMemoryPrompts != null) {
        for (const [childIndex, child] of project.childMemoryPrompts.entries()) {
          results.push({
            path: this.resolveFullPath(child.dir),
            scope: 'project',
            source: {type: 'projectChildMemory', projectIndex, childIndex}
          })
        }
      }
    }

    return results
  }

  override async convertContent(
    declaration: OutputFileDeclaration,
    ctx: OutputWriteContext
  ): Promise<string> {
    const {projects} = ctx.collectedOutputContext.workspace
    const source = declaration.source as {type?: string, projectIndex?: number, childIndex?: number}
    const projectIndex = source.projectIndex ?? -1
    if (projectIndex < 0 || projectIndex >= projects.length) throw new Error(`Invalid project index in declaration for ${this.name}`)

    const project = projects[projectIndex]
    if (project == null) throw new Error(`Project not found for declaration in ${this.name}`)

    if (source.type === 'projectRootMemory') {
      if (project.rootMemoryPrompt == null) throw new Error(`Root memory prompt missing for project index ${projectIndex}`)
      return project.rootMemoryPrompt.content as string
    }

    if (source.type === 'projectChildMemory') {
      const childIndex = source.childIndex ?? -1
      const child = project.childMemoryPrompts?.[childIndex]
      if (child == null) throw new Error(`Child memory prompt missing for project ${projectIndex}, child ${childIndex}`)
      return child.content as string
    }

    throw new Error(`Unsupported declaration source for ${this.name}`)
  }
}
