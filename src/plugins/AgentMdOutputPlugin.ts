import type { Logger } from 'winston'
import type { OutputPlugin, OutputPluginContext, RelativePath } from '@/types'
import { createLogger } from '@/log'
import { PluginKind } from '@/types'

export class AgentMdOutputPlugin implements OutputPlugin {
  type = PluginKind.Output as const
  name = 'AgentMdOutputPlugin'
  log: Logger = createLogger(this.name)

  async registerProjectOutputDirs(ctx: OutputPluginContext): Promise<RelativePath[]> {
    ctx.collectedInputContext.workspace.projects.map((project) => {
      const rootPrompt = project.rootMemoryPrompt
      const childrenPrompts = project.childMemoryPrompts
      return [rootPrompt, ...(childrenPrompts ?? [])].map((e) => e?.dir).filter((e) => !!e)
    })
    return []
  }
}
