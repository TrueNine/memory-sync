import type {Command, CommandContext, CommandResult} from './Command'
import {checkVersion, logVersionCheckResult} from '@/versionCheck'

/**
 * Outdated command - check if CLI version is outdated
 */
export class OutdatedCommand implements Command {
  readonly name = 'outdated'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    const result = await checkVersion()
    logVersionCheckResult(result, ctx.logger)

    return {
      success: true,
      filesAffected: 0,
      dirsAffected: 0,
      message: `Version status: ${result.status}`
    }
  }
}
