import type {Command, CommandContext, CommandResult} from './Command'
import process from 'node:process'
import {getCliVersion} from './VersionCommand'

const CLI_NAME = 'tnmsc'

const HELP_TEXT = `
# ${CLI_NAME} v${getCliVersion()}

Synchronize AI memory and configuration files across projects.

## Usage

- \`${CLI_NAME}\` runs the default install pipeline.
- \`${CLI_NAME} help\` shows this help message.
- \`${CLI_NAME} version\` shows the CLI version.
- \`${CLI_NAME} install\` runs the install pipeline explicitly.
- \`${CLI_NAME} dry-run\` previews what would be written.
- \`${CLI_NAME} clean\` removes generated files.
- \`${CLI_NAME} clean --dry-run\` previews what would be cleaned.

## Subcommands

- \`help\` shows this help message.
- \`version\` shows version information.
- \`install\` runs the install pipeline.
- \`dry-run\` previews changes without writing files.
- \`clean\` removes generated output files and directories.

## Aliases

- \`${CLI_NAME} --help\` and \`${CLI_NAME} -h\` are the same as \`${CLI_NAME} help\`.
- \`${CLI_NAME} --version\` and \`${CLI_NAME} -v\` are the same as \`${CLI_NAME} version\`.
- \`${CLI_NAME} clean -n\` is the same as \`${CLI_NAME} clean --dry-run\`.

## Log Controls

- \`--trace\` shows the most detail.
- \`--debug\` shows debug detail.
- \`--info\` shows key progress and results.
- \`--warn\` shows warnings only.
- \`--error\` shows errors only.

## Clean Option

- \`-n\`, \`--dry-run\` previews cleanup without removing files.

## Configuration

- Global user config: \`~/.aindex/.tnmsc.json\`
- Project runtime assembly: \`plugin.config.ts\`
`.trim()

export class HelpCommand implements Command {
  readonly name = 'help'

  async execute(ctx: CommandContext): Promise<CommandResult> {
    void ctx
    process.stdout.write(`${HELP_TEXT}\n`)
    return {success: true, filesAffected: 0, dirsAffected: 0, message: 'Help displayed'}
  }
}
