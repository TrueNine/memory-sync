import type {CollectedInputContext, InputPluginContext} from '@/types'
import {AbstractInputPlugin} from './AbstractInputPlugin'

/**
 * Options for configuring BaseFileInputPlugin
 */
export interface FileInputPluginOptions {
  readonly fallbackContent?: string
}

export abstract class BaseFileInputPlugin<TResult = string> extends AbstractInputPlugin {
  protected readonly options: FileInputPluginOptions

  protected constructor(name: string, options?: FileInputPluginOptions) {
    super(name)
    this.options = options ?? {}
  }

  protected abstract getFilePath(shadowProjectDir: string): string

  protected abstract getResultKey(): keyof CollectedInputContext

  protected transformContent(content: string): TResult {
    return content as unknown as TResult
  }

  collect(ctx: InputPluginContext): Partial<CollectedInputContext> {
    const {shadowProjectDir} = this.resolveBasePaths(ctx.userConfigOptions)
    const filePath = this.getFilePath(shadowProjectDir)

    if (!ctx.fs.existsSync(filePath)) {
      if (this.options.fallbackContent != null) {
        this.log.debug({action: 'collect', message: 'Using fallback content', path: filePath})
        return {[this.getResultKey()]: this.transformContent(this.options.fallbackContent)} as Partial<CollectedInputContext>
      }
      this.log.debug({action: 'collect', message: 'File not found', path: filePath})
      return {}
    }

    const content = ctx.fs.readFileSync(filePath, 'utf8')

    if (content.length === 0) {
      if (this.options.fallbackContent != null) {
        this.log.debug({action: 'collect', message: 'File empty, using fallback', path: filePath})
        return {[this.getResultKey()]: this.transformContent(this.options.fallbackContent)} as Partial<CollectedInputContext>
      }
      this.log.debug({action: 'collect', message: 'File is empty', path: filePath})
      return {}
    }

    this.log.debug({action: 'collect', message: 'Loaded file content', path: filePath, length: content.length})
    return {[this.getResultKey()]: this.transformContent(content)} as Partial<CollectedInputContext>
  }
}
