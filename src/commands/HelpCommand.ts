import type { Command, CommandContext, CommandResult } from './Command'

const CLI_NAME = 'tnmsc'
const VERSION = '0.0.6'

const HELP_TEXT = `
${CLI_NAME} v${VERSION} - Memory Sync CLI

Synchronize AI memory and configuration files across projects.

USAGE:
  ${CLI_NAME}                         Run the sync pipeline (default)
  ${CLI_NAME} help                    Show this help message
  ${CLI_NAME} init                    Initialize directories and files
  ${CLI_NAME} dry-run                 Preview what would be written
  ${CLI_NAME} clean                   Remove all generated files
  ${CLI_NAME} clean --dry-run         Preview what would be cleaned
  ${CLI_NAME} --set key=value         Set configuration value
  ${CLI_NAME} set key=value           Set configuration value (same as --set)

SUBCOMMANDS:
  help       Show this help message
  init       Initialize directory structure based on configuration
  dry-run    Preview changes without writing files
  clean      Remove all generated output files and directories
  set        Set configuration values in global config file

ALIASES:
  ${CLI_NAME} --help, ${CLI_NAME} -h      Same as '${CLI_NAME} help'
  ${CLI_NAME} clean -n              Same as '${CLI_NAME} clean --dry-run'
  ${CLI_NAME} set key=value         Same as '${CLI_NAME} --set key=value'

LOG LEVEL OPTIONS:
  --trace        Most verbose output
  --debug        Debug information
  --info         Standard information (default)
  --warn         Warnings only
  --error        Errors only

CLEAN OPTIONS:
  -n, --dry-run  Preview cleanup without removing files

SET OPTIONS:
  --set key=value    Set a configuration value in global config (~/.aindex/.tnmsc.json)
  Valid keys: workspaceDir, shadowSourceProjectDir, shadowSkillSourceDir,
              shadowFastCommandDir, shadowSubAgentDir, globalMemoryFile,
              shadowProjectsDir, logLevel

  Examples:
    ${CLI_NAME} --set workspaceDir=~/my-project
    ${CLI_NAME} --set logLevel=debug
    ${CLI_NAME} set workspaceDir=~/workspace

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
