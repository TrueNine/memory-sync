import type {
  OutputPluginContext,
  OutputWriteContext,
  WriteResult,
  WriteResults
} from '../plugin-shared'
import type {RelativePath} from '../plugin-shared/types'
import {AbstractOutputPlugin} from '@truenine/plugin-output-shared'

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

  async registerProjectOutputDirs(): Promise<RelativePath[]> {
    return []
  }

  async registerProjectOutputFiles(): Promise<RelativePath[]> {
    return []
  }

  async registerGlobalOutputDirs(): Promise<RelativePath[]> {
    return [
      this.createRelativePath(USER_RULES_SUBDIR, this.getGlobalConfigDir(), () => USER_RULES_SUBDIR)
    ]
  }

  async registerGlobalOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const {globalMemory} = ctx.collectedInputContext
    const results: RelativePath[] = []

    if (globalMemory != null) results.push(this.createRelativePath(GLOBAL_MEMORY_FILE, this.getGlobalUserRulesDir(), () => USER_RULES_SUBDIR))

    return results
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const {globalMemory} = ctx.collectedInputContext
    if (globalMemory != null) return true
    this.log.trace({action: 'skip', reason: 'noGlobalMemory'})
    return false
  }

  async writeProjectOutputs(): Promise<WriteResults> {
    return {files: [], dirs: []}
  }

  async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const {globalMemory} = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const userRulesDir = this.getGlobalUserRulesDir()

    if (globalMemory != null) {
      fileResults.push(await this.writeFile(ctx, this.joinPath(userRulesDir, GLOBAL_MEMORY_FILE), globalMemory.content as string, 'globalMemory'))
    }

    return {files: fileResults, dirs: []}
  }
}
