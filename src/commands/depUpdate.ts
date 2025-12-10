import process from 'node:process'
import { confirm, intro, outro, spinner } from '@clack/prompts'
import { execa } from 'execa'
import pc from 'picocolors'
import { LogAdapter, shutdownLogger } from '../utils/log'

const log = new LogAdapter('commands/depUpdate')

export async function depUpdateCommand(): Promise<void> {
  intro(pc.bgCyan(pc.black(' Dependency Update ')))

  const s = spinner()

  try {
    s.start('Checking outdated dependencies...')

    const { stdout: outdatedOutput } = await execa('pnpm', ['outdated'], {
      reject: false,
    })

    s.stop('Check complete')

    if (!outdatedOutput) {
      log.info('✓ All dependencies are up to date')
      outro(pc.green('Nothing to update'))
      return
    }

    log.info('Outdated dependencies:')
    log.info('{}', outdatedOutput)
    log.info('')

    const shouldUpdate = await confirm({
      message: 'Update all compatible dependencies?',
    })

    if (shouldUpdate !== true) {
      outro(pc.gray('Update cancelled'))
      return
    }

    s.start('Updating dependencies...')

    await execa('pnpm', ['update'], {
      stdio: 'inherit',
    })

    s.stop('Dependencies updated')

    outro(pc.green('✓ Update complete'))
  } catch (error) {
    s.stop('Update failed')
    log.error('{}', error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  } finally {
    await shutdownLogger()
  }
}
