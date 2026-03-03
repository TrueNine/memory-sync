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
  ${CLI_NAME} outdated                Check for version updates
  ${CLI_NAME} init                    Initialize directories and files
  ${CLI_NAME} dry-run                 Preview what would be written
  ${CLI_NAME} clean                   Remove all generated files
  ${CLI_NAME} clean --dry-run         Preview what would be cleaned
  ${CLI_NAME} config key=value        Set configuration value

SUBCOMMANDS:
  help       Show this help message
  version    Show version information
  outdated   Check if CLI version is outdated against npm registry
  init       Initialize directory structure based on configuration
  dry-run    Preview changes without writing files
  clean      Remove all generated output files and directories
  config     Set configuration values in global config file (~/.aindex/.tnmsc.json)

ALIASES:
  ${CLI_NAME} --help, ${CLI_NAME} -h      Same as '${CLI_NAME} help'
  ${CLI_NAME} --version, ${CLI_NAME} -v   Same as '${CLI_NAME} version'
  ${CLI_NAME} clean -n              Same as '${CLI_NAME} clean --dry-run'
  ${CLI_NAME} config key=value      Set config value in global config file

LOG LEVEL OPTIONS:
  --trace        Most verbose output
  --debug        Debug information
  --info         Standard information (default)
  --warn         Warnings only
  --error        Errors only

CLEAN OPTIONS:
  -n, --dry-run  Preview cleanup without removing files

CONFIG OPTIONS:
  key=value          Set a configuration value in global config (~/.aindex/.tnmsc.json)
  Valid keys: workspaceDir, logLevel,
              aindex.skills.src, aindex.skills.dist,
              aindex.commands.src, aindex.commands.dist,
              aindex.subAgents.src, aindex.subAgents.dist,
              aindex.rules.src, aindex.rules.dist,
              aindex.globalPrompt.src, aindex.globalPrompt.dist,
              aindex.workspacePrompt.src, aindex.workspacePrompt.dist,
              aindex.app.src, aindex.app.dist,
              aindex.ext.src, aindex.ext.dist,
              aindex.arch.src, aindex.arch.dist

  Examples:
    ${CLI_NAME} config workspaceDir=~/my-project
    ${CLI_NAME} config aindex.skills.src=skills
    ${CLI_NAME} config logLevel=debug

CONFIGURATION:
  Configure via plugin.config.ts in your project root.
  See documentation for detailed configuration options.
`.trim()

/**
 * Help command - displays CLI usage information
 */
export class HelpCommand implements Command {
  readonly name = 'help'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    ctx.logger.info(HELP_TEXT)

    return {
      success: true,
      filesAffected: 0,
      dirsAffected: 0,
      message: 'Help displayed'
    }
  }
}
