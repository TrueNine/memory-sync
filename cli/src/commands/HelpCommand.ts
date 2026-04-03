import type {Command, CommandContext, CommandResult} from './Command'
import {getCliVersion} from './VersionCommand'

const CLI_NAME = 'tnmsc'

const HELP_TEXT = `
${CLI_NAME} v${getCliVersion()} - Memory Sync CLI

Synchronize AI memory and configuration files across projects.

USAGE:
  ${CLI_NAME}                         Run the sync pipeline (default)
  ${CLI_NAME} help                    Show this help message
  ${CLI_NAME} version                 Show version information
  ${CLI_NAME} dry-run                 Preview what would be written
  ${CLI_NAME} clean                   Remove all generated files
  ${CLI_NAME} clean --dry-run         Preview what would be cleaned

SUBCOMMANDS:
  help       Show this help message
  version    Show version information
  dry-run    Preview changes without writing files
  clean      Remove all generated output files and directories

ALIASES:
  ${CLI_NAME} --help, ${CLI_NAME} -h      Same as '${CLI_NAME} help'
  ${CLI_NAME} --version, ${CLI_NAME} -v   Same as '${CLI_NAME} version'
  ${CLI_NAME} clean -n              Same as '${CLI_NAME} clean --dry-run'

LOG LEVEL OPTIONS:
  --trace        Most verbose output
  --debug        Debug information
  --info         Standard information (default)
  --warn         Warnings only
  --error        Errors only

CLEAN OPTIONS:
  -n, --dry-run  Preview cleanup without removing files

CONFIGURATION:
  Global user config lives at ~/.aindex/.tnmsc.json.
  Edit that file directly, then use plugin.config.ts in your project root
  for project-side plugin assembly and runtime overrides.
`.trim()

export class HelpCommand implements Command {
  readonly name = 'help'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    ctx.logger.info(HELP_TEXT)
    return {success: true, filesAffected: 0, dirsAffected: 0, message: 'Help displayed'}
  }
}
