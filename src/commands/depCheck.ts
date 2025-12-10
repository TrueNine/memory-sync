import process from 'node:process'
import { intro, outro, spinner } from '@clack/prompts'
import { execa } from 'execa'
import pc from 'picocolors'
import { LogAdapter, shutdownLogger } from '../utils/log'

const log = new LogAdapter('commands/depCheck')

export async function depCheckCommand(): Promise<void> {
  intro(pc.bgCyan(pc.black(' Dependency Check ')))

  const s = spinner()

  try {
    s.start('Checking outdated dependencies...')

    const { stdout } = await execa('pnpm', ['outdated'], {
      reject: false,
    })

    s.stop('Dependency check complete')

    if (stdout) {
      log.info('Outdated dependencies:')
      log.info('{}', stdout)
    } else {
      log.info('✓ All dependencies are up to date')
    }

    outro(pc.green('Check complete'))
  } catch (error) {
    s.stop('Check failed')
    log.error('{}', error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  } finally {
    await shutdownLogger()
  }
}
