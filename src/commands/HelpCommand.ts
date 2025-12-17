import type { Command, CommandContext, CommandResult } from './Command'

const CLI_NAME = 'tnmsc'
const VERSION = '0.0.6'

const HELP_TEXT = `
${CLI_NAME} v${VERSION} - Memory Sync CLI

Synchronize AI memory and configuration files across projects.

USAGE:
  ${CLI_NAME} [OPTIONS]

OPTIONS:
  -h, --help      Show this help message
  -c, --clean     Clean generated output files and directories
  -n, --dry-run   Preview changes without writing files

EXAMPLES:
  ${CLI_NAME}              Run the sync pipeline (default)
  ${CLI_NAME} --dry-run    Preview what would be written
  ${CLI_NAME} --clean      Remove all generated files
  ${CLI_NAME} -cn          Preview what would be cleaned

CONFIGURATION:
  Configure via plugin.config.ts in your project root.
  See documentation for detailed configuration options.
`.trim()

/**
 * Help command - displays CLI usage information
 */
export class HelpCommand implements Command {
  readonly name = 'help'

  async execute(_ctx: CommandContext): Promise<CommandResult> {
    // eslint-disable-next-line no-console
    console.log(HELP_TEXT)

    return {
      success: true,
      filesAffected: 0,
      dirsAffected: 0,
      message: 'Help displayed',
    }
  }
}
