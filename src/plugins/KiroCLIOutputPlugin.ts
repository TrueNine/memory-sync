import type { Logger } from '@/log'
import type {
  OutputPlugin,
  OutputPluginContext,
  OutputWriteContext,
  WriteResult,
  WriteResults,
} from '@/types'
import type { RelativePath } from '@/types/FileSystemTypes'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { createLogger } from '@/log'
import { FilePathKind, PluginKind } from '@/types'

const GLOBAL_MEMORY_FILE = 'GLOBAL.md'
const GLOBAL_CONFIG_DIR = '.kiro'
const STEERING_SUBDIR = 'steering'

export class KiroCLIOutputPlugin implements OutputPlugin {
  readonly type = PluginKind.Output
  readonly name = 'KiroCLIOutputPlugin'
  readonly log: Logger

  constructor() {
    this.log = createLogger(this.name)
  }

  async registerGlobalOutputDirs(_ctx: OutputPluginContext): Promise<RelativePath[]> {
    const globalDir = this.getGlobalSteeringDir()
    return [
      {
        pathKind: FilePathKind.Relative,
        path: STEERING_SUBDIR,
        basePath: path.join(os.homedir(), GLOBAL_CONFIG_DIR),
        getDirectoryName: () => STEERING_SUBDIR,
        getAbsolutePath: () => globalDir,
      },
    ]
  }

  async registerGlobalOutputFiles(ctx: OutputPluginContext): Promise<RelativePath[]> {
    const { globalMemory } = ctx.collectedInputContext
    if (globalMemory == null) {
      return []
    }

    const globalDir = this.getGlobalSteeringDir()
    return [
      {
        pathKind: FilePathKind.Relative,
        path: GLOBAL_MEMORY_FILE,
        basePath: globalDir,
        getDirectoryName: () => STEERING_SUBDIR,
        getAbsolutePath: () => path.join(globalDir, GLOBAL_MEMORY_FILE),
      },
    ]
  }

  async canWrite(ctx: OutputWriteContext): Promise<boolean> {
    const { globalMemory } = ctx.collectedInputContext
    const hasGlobalMemory = globalMemory != null

    if (!hasGlobalMemory) {
      this.log.info('No outputs to write, skipping')
      return false
    }

    return true
  }

  async writeGlobalOutputs(ctx: OutputWriteContext): Promise<WriteResults> {
    const { globalMemory } = ctx.collectedInputContext
    const fileResults: WriteResult[] = []
    const dirResults: WriteResult[] = []

    if (globalMemory == null) {
      this.log.info('No global memory found, skipping global output')
      return { files: fileResults, dirs: dirResults }
    }

    const globalDir = this.getGlobalSteeringDir()
    const fullPath = path.join(globalDir, GLOBAL_MEMORY_FILE)
    const relativePath: RelativePath = {
      pathKind: FilePathKind.Relative,
      path: GLOBAL_MEMORY_FILE,
      basePath: globalDir,
      getDirectoryName: () => STEERING_SUBDIR,
      getAbsolutePath: () => fullPath,
    }

    if (ctx.dryRun === true) {
      this.log.info(`[DRY-RUN] Would write global memory -> ${fullPath}`)
      return {
        files: [{ path: relativePath, success: true, skipped: false }],
        dirs: dirResults,
      }
    }

    try {
      if (!fs.existsSync(globalDir)) {
        fs.mkdirSync(globalDir, { recursive: true })
      }

      fs.writeFileSync(fullPath, globalMemory.content as string, 'utf-8')
      this.log.info(`Written global memory -> ${fullPath}`)
      fileResults.push({ path: relativePath, success: true })
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log.error(`Failed to write global memory: ${errMsg}`)
      fileResults.push({ path: relativePath, success: false, error: error as Error })
    }

    return { files: fileResults, dirs: dirResults }
  }

  private getGlobalSteeringDir(): string {
    return path.join(os.homedir(), GLOBAL_CONFIG_DIR, STEERING_SUBDIR)
  }

  async onWriteComplete(ctx: OutputWriteContext, results: WriteResults): Promise<void> {
    const successCount = results.files.filter((r) => r.success).length
    const skipCount = results.files.filter((r) => r.skipped).length
    const failCount = results.files.filter((r) => !(r.success) && !(r.skipped)).length

    const mode = ctx.dryRun === true ? '[DRY-RUN]' : ''
    this.log.info(`${mode} Write complete: ${successCount} success, ${skipCount} skipped, ${failCount} failed`)
  }
}
