import {describe, expect, it} from 'vitest'
import {parseArgs, resolveCommand} from './CliArgumentParser'

describe('cli argument parser', () => {
  it('resolves the dry-run subcommand to DryRunOutputCommand', () => {
    const command = resolveCommand(parseArgs(['dry-run']))
    expect(command.name).toBe('dry-run-output')
  })
})
