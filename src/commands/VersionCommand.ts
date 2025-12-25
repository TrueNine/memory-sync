import type { Command, CommandContext, CommandResult } from './Command'

const CLI_NAME = 'tnmsc'

/**
 * Get CLI version from build-time injected constant.
 * Falls back to 'unknown' in development mode.
 */
export function getCliVersion(): string {
  return typeof __CLI_VERSION__ !== 'undefined' ? __CLI_VERSION__ : 'dev'
}

/**
 * Version command - displays CLI version
 */
export class VersionCommand implements Command {
  readonly name = 'version'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    ctx.logger.error(`${CLI_NAME} v${getCliVersion()}`)

    return {
      success: true,
      filesAffected: 0,
      dirsAffected: 0,
      message: 'Version displayed',
    }
  }
}
