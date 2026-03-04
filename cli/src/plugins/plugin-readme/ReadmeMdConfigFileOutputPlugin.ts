import type {
  OutputFileDeclaration,
  OutputWriteContext,
  ReadmeFileKind
} from '../plugin-core'

import * as path from 'node:path'
import {AbstractOutputPlugin, README_FILE_KIND_MAP} from '../plugin-core'

function resolveOutputFileName(fileKind?: ReadmeFileKind): string {
  return README_FILE_KIND_MAP[fileKind ?? 'Readme'].out
}

/**
 * Output plugin for writing readme-family files to project directories.
 * Reads README prompts collected by ReadmeMdInputPlugin and writes them
 * to the corresponding project directories.
 *
 * Output mapping:
 * - fileKind=Readme → README.md
 * - fileKind=CodeOfConduct → CODE_OF_CONDUCT.md
 * - fileKind=Security → SECURITY.md
 *
 * Supports:
 * - Root files (written to project root)
 * - Child files (written to project subdirectories)
 * - Dry-run mode (preview without writing)
 * - Clean operation (delete generated files)
 */
export class ReadmeMdConfigFileOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('ReadmeMdConfigFileOutputPlugin', {outputFileName: 'README.md', capabilities: {}})
  }

  override async declareOutputFiles(ctx: OutputWriteContext): Promise<OutputFileDeclaration[]> {
    const declarations: OutputFileDeclaration[] = []
    const {readmePrompts} = ctx.collectedOutputContext
    if (readmePrompts == null || readmePrompts.length === 0) return declarations

    for (const readme of readmePrompts) {
      const outputFileName = resolveOutputFileName(readme.fileKind)
      const filePath = path.join(readme.targetDir.basePath, readme.targetDir.path, outputFileName)
      declarations.push({
        path: filePath,
        scope: 'project',
        source: {content: readme.content as string}
      })
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
