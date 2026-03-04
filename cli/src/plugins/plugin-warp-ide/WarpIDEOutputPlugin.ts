import type {
  OutputFileDeclaration,
  OutputWriteContext
} from '../plugin-core'
import {AbstractOutputPlugin, PLUGIN_NAMES} from '../plugin-core'

const PROJECT_MEMORY_FILE = 'WARP.md'

export class WarpIDEOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('WarpIDEOutputPlugin', {
      outputFileName: PROJECT_MEMORY_FILE,
      indexignore: '.warpindexignore',
      capabilities: {
        prompt: {
          scopes: ['project', 'global'],
          singleScope: false
        }
      }
    })
  }

  override async declareOutputFiles(ctx: OutputWriteContext): Promise<OutputFileDeclaration[]> {
    const declarations: OutputFileDeclaration[] = []
    const {workspace, globalMemory, aiAgentIgnoreConfigFiles} = ctx.collectedOutputContext
    const {projects} = workspace
    const agentsRegistered = this.shouldSkipDueToPlugin(ctx, PLUGIN_NAMES.AgentsOutput)
    const activePromptScopes = new Set(this.selectPromptScopes(ctx, ['project', 'global']))

    if (agentsRegistered) {
      if (globalMemory != null && activePromptScopes.has('global')) {
        for (const project of projects) {
          const projectDir = project.dirFromWorkspacePath
          if (projectDir == null) continue
          declarations.push({
            path: this.resolveFullPath(projectDir),
            scope: 'project',
            source: {content: globalMemory.content as string}
          })
        }
      }
    } else {
      const globalMemoryContent = this.extractGlobalMemoryContent(ctx)
      for (const project of projects) {
        const projectDir = project.dirFromWorkspacePath
        if (projectDir == null) continue

        if (project.rootMemoryPrompt != null && activePromptScopes.has('project')) {
          const combinedContent = this.combineGlobalWithContent(
            globalMemoryContent,
            project.rootMemoryPrompt.content as string
          )
          declarations.push({
            path: this.resolveFullPath(projectDir),
            scope: 'project',
            source: {content: combinedContent}
          })
        }

        if (project.childMemoryPrompts != null && activePromptScopes.has('project')) {
          for (const child of project.childMemoryPrompts) {
            declarations.push({
              path: this.resolveFullPath(child.dir),
              scope: 'project',
              source: {content: child.content as string}
            })
          }
        }
      }
    }

    const ignoreOutputPath = this.getIgnoreOutputPath()
    const ignoreFile = this.indexignore == null
      ? void 0
      : aiAgentIgnoreConfigFiles?.find(file => file.fileName === this.indexignore)
    if (ignoreOutputPath != null && ignoreFile != null) {
      for (const project of projects) {
        const projectDir = project.dirFromWorkspacePath
        if (projectDir == null || project.isPromptSourceProject === true) continue
        declarations.push({
          path: this.resolvePath(projectDir.basePath, projectDir.path, ignoreOutputPath),
          scope: 'project',
          source: {content: ignoreFile.content}
        })
      }
    }

    return declarations
  }

  override async convertContent(
    declaration: OutputFileDeclaration,
    _ctx: OutputWriteContext
  ): Promise<string> {
    const source = declaration.source as {content?: string}
    if (source.content == null) throw new Error(`Unsupported declaration source for ${this.name}`)
    return source.content
  }
}
