import type {Command, CommandContext, CommandResult} from './Command'

const CLI_NAME = 'tnmsc'

export function getCliVersion(): string {
  return typeof __CLI_VERSION__ !== 'undefined' ? __CLI_VERSION__ : 'dev'
}

export class VersionCommand implements Command {
  readonly name = 'version'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    ctx.logger.info(`${CLI_NAME} v${getCliVersion()}`)
    return {success: true, filesAffected: 0, dirsAffected: 0, message: 'Version displayed'}
  }
}
