import {describe, expect, it} from 'vitest'
import {parseArgs, resolveCommand} from './CliArgumentParser'

describe('cli argument parser', () => {
  it('resolves the init subcommand to InitCommand', () => {
    const command = resolveCommand(parseArgs(['init']))
    expect(command.name).toBe('init')
  })
})
