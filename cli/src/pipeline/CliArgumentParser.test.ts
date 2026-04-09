import {describe, expect, it} from 'vitest'
import {parseArgs, resolveCommand} from './CliArgumentParser'

describe('cli argument parser', () => {
  it('resolves the install subcommand to InstallCommand', () => {
    const command = resolveCommand(parseArgs(['install']))
    expect(command.name).toBe('install')
  })

  it('resolves the dry-run subcommand to DryRunOutputCommand', () => {
    const command = resolveCommand(parseArgs(['dry-run']))
    expect(command.name).toBe('dry-run-output')
  })
})
