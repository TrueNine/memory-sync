import type {
  OutputPluginContext,
  OutputWriteContext,
  ReadmeFileKind,
  WriteResult,
  WriteResults
} from '../plugin-shared'
import type {RelativePath} from '../plugin-shared/types'

import * as fs from 'node:fs'
import * as path from 'node:path'
import {AbstractOutputPlugin} from '@truenine/plugin-output-shared'
import {FilePathKind, README_FILE_KIND_MAP} from '../plugin-shared'

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
    super('ReadmeMdConfigFileOutputPlugin', {outputFileName: 'README.md'})
  }

  async registerProjectOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const results: RelativePath[] = []
    const {readmePrompts} = ctx.collectedInputContext

    if (readmePrompts == null || readmePrompts.length === 0) return results

    for (const readme of readmePrompts) {
      const {targetDir} = readme
      const outputFileName = resolveOutputFileName(readme.fileKind)
      const filePath = path.join(targetDir.path, outputFileName)

      results.push({
        pathKind: FilePathKind.Relative,
        path: filePath,
        basePath: targetDir.basePath,
        getDirectoryName: () => targetDir.getDirectoryName(),
        getAbsolutePath: () => path.join(targetDir.basePath, filePath)
      })
    }

    return results
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {readmePrompts} = ctx.collectedInputContext

    if (readmePrompts?.length !== 0) return true

    this.log.debug('skipped', {reason: 'no README prompts to write'})
    return false
  }

  async writeProjectOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []
    const {readmePrompts} = ctx.collectedInputContext

    if (readmePrompts == null || readmePrompts.length === 0) return {files: fileResults, dirs: dirResults}

    for (const readme of readmePrompts) {
      const result = await this.writeReadmeFile(ctx, readme)
      fileResults.push(result)
    }

    return {files: fileResults, dirs: dirResults}
  }

  private async writeReadmeFile(
    ctx: OutputWriteContext,
    readme: {projectName: string, targetDir: RelativePath, content: unknown, isRoot: boolean, fileKind?: ReadmeFileKind}
  ): Promise<WriteResult> {
    const {targetDir} = readme
    const outputFileName = resolveOutputFileName(readme.fileKind)
    const filePath = path.join(targetDir.path, outputFileName)
    const fullPath = path.join(targetDir.basePath, filePath)
    const content = readme.content as string

    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: filePath,
      basePath: targetDir.basePath,
      getDirectoryName: () => targetDir.getDirectoryName(),
      getAbsolutePath: () => fullPath
    }

    const label = readme.isRoot
      ? `project:${readme.projectName}/${outputFileName}`
      : `project:${readme.projectName}/${targetDir.path}/${outputFileName}`

    if (ctx.dryRun === true) { // Dry-run mode: log without writing
      this.log.trace({action: 'dryRun', type: 'readme', path: fullPath, label})
      return {path: relativePath, success: true, skipped: false}
    }

    try { // Actual write operation
      const dir = path.dirname(fullPath) // Ensure target directory exists
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true})

      fs.writeFileSync(fullPath, content, 'utf8')
      this.log.trace({action: 'write', type: 'readme', path: fullPath, label})
      return {path: relativePath, success: true}
    }
    catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error({action: 'write', type: 'readme', path: fullPath, label, error: errMsg})
      return {path: relativePath, success: false, error: error as Error}
    }
  }
}
