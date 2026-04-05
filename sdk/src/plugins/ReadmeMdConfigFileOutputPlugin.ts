import type {
  OutputFileDeclaration,
  OutputWriteContext,
  ReadmeFileKind
} from './plugin-core'

import * as path from 'node:path'
import {AbstractOutputPlugin, README_FILE_KIND_MAP} from './plugin-core'

const EDITOR_CONFIG_FILE = '.editorconfig'

function resolveOutputFileName(fileKind?: ReadmeFileKind): string {
  return README_FILE_KIND_MAP[fileKind ?? 'Readme'].out
}

function appendEditorConfigDeclarations(
  declarations: OutputFileDeclaration[],
  ctx: OutputWriteContext
): void {
  const {projects} = ctx.collectedOutputContext.workspace
  const {editorConfigFiles} = ctx.collectedOutputContext

  if (editorConfigFiles == null || editorConfigFiles.length === 0) return

  for (const project of projects) {
    const projectDir = project.dirFromWorkspacePath
    if (projectDir == null) continue

    for (const config of editorConfigFiles) {
      declarations.push({
        path: path.join(projectDir.basePath, projectDir.path, EDITOR_CONFIG_FILE),
        scope: 'project',
        source: {content: config.content}
      })
    }
  }
}

/**
 * Output plugin for writing readme-family files and .editorconfig files to
 * project directories.
 * Reads README prompts collected by ReadmeMdInputCapability and EditorConfig
 * files collected by EditorConfigInputCapability, then writes them to the
 * corresponding project directories.
 *
 * Output mapping:
 * - fileKind=Readme → README.md
 * - fileKind=CodeOfConduct → CODE_OF_CONDUCT.md
 * - fileKind=Security → SECURITY.md
 * - editorConfigFiles → .editorconfig
 *
 * Supports:
 * - Root files (written to project root)
 * - Child files (written to project subdirectories)
 * - Dry-run mode (preview without writing)
 * - Clean operation (delete generated files)
 */
export class ReadmeMdConfigFileOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('ReadmeMdConfigFileOutputPlugin', {
      outputFileName: 'README.md',
      cleanup: {
        delete: {
          project: {
            files: ['README.md', 'CODE_OF_CONDUCT.md', 'SECURITY.md', EDITOR_CONFIG_FILE]
          }
        }
      },
      capabilities: {}
    })
  }

  override async declareOutputFiles(ctx: OutputWriteContext): Promise<OutputFileDeclaration[]> {
    const declarations: OutputFileDeclaration[] = []
    const {readmePrompts} = ctx.collectedOutputContext

    if (readmePrompts != null) {
      for (const readme of readmePrompts) {
        const outputFileName = resolveOutputFileName(readme.fileKind)
        const filePath = path.join(readme.targetDir.basePath, readme.targetDir.path, outputFileName)
        declarations.push({
          path: filePath,
          scope: 'project',
          source: {content: readme.content as string}
        })
      }
    }

    appendEditorConfigDeclarations(declarations, ctx)

    return declarations
  }

  override async convertContent(
    declaration: OutputFileDeclaration,
    ctx: OutputWriteContext
  ): Promise<string> {
    void ctx
    const source = declaration.source as {content?: string}
    if (source.content == null) throw new Error(`Unsupported declaration source for ${this.name}`)
    return source.content
  }
}
