import type {
  OutputPluginContext,
  OutputWriteContext,
  WriteResult,
  WriteResults
} from '../plugin-core'
import {AbstractOutputPlugin} from '../plugin-core'

const GLOBAL_MEMORY_FILE = 'GLOBAL.md'
const GLOBAL_CONFIG_DIR = '.trae-cn'
const USER_RULES_SUBDIR = 'user_rules'

export class TraeCNIDEOutputPlugin extends AbstractOutputPlugin {
  constructor() {
    super('TraeCNIDEOutputPlugin', {
      globalConfigDir: GLOBAL_CONFIG_DIR,
      outputFileName: GLOBAL_MEMORY_FILE,
      dependsOn: ['TraeIDEOutputPlugin']
    })
  }

  private getGlobalUserRulesDir(): string {
    return this.joinPath(this.getGlobalConfigDir(), USER_RULES_SUBDIR)
  }

  override async registerProjectOutputDirs(): Promise<string[]> {
    return []
  }

  override async registerProjectOutputFiles(): Promise<string[]> {
    return []
  }

  override async registerGlobalOutputDirs(): Promise<string[]> {
    return [
      this.joinPath(this.getGlobalConfigDir(), USER_RULES_SUBDIR)
    ]
  }

  override async registerGlobalOutputFiles(ctx: OutputPluginContext): Promise<string[]> {
    const {globalMemory} = ctx.collectedInputContext
    const results: string[] = []

    if (globalMemory != null) results.push(this.joinPath(this.getGlobalUserRulesDir(), GLOBAL_MEMORY_FILE))

    return results
  }

  override async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {globalMemory} = ctx.collectedInputContext
    if (globalMemory != null) return true
    this.log.trace({action: 'skip', reason: 'noGlobalMemory'})
    return false
  }

  override async writeProjectOutputs(): Promise<WriteResults> {
    return {files: [], dirs: []}
  }

  override async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {globalMemory} = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const userRulesDir = this.getGlobalUserRulesDir()

    if (globalMemory != null) {
      fileResults.push(await this.writeFile(ctx, this.joinPath(userRulesDir, GLOBAL_MEMORY_FILE), globalMemory.content as string, 'globalMemory'))
    }

    return {files: fileResults, dirs: []}
  }
}
