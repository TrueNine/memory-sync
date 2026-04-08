import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
import process from 'node:process'

const NODE_OPTIONS_SPLIT_PATTERN = /\s+/u

const require = createRequire(import.meta.url)
const nextBinPath = require.resolve('next/dist/bin/next')
const nextArgs = process.argv.slice(2)
const nodeOptions = process.env.NODE_OPTIONS ?? ''

function hasNodeOption(optionName: string): boolean {
  return nodeOptions.split(NODE_OPTIONS_SPLIT_PATTERN).some(
    option => option === optionName || option.startsWith(`${optionName}=`)
  )
}

const shouldDisableWebStorage = !hasNodeOption('--experimental-webstorage')
  && !hasNodeOption('--no-experimental-webstorage')
  && !hasNodeOption('--webstorage')
  && !hasNodeOption('--no-webstorage')
  && !hasNodeOption('--localstorage-file')

const mergedNodeOptions = shouldDisableWebStorage
  ? `--no-experimental-webstorage ${nodeOptions}`.trim()
  : nodeOptions

const child = spawn(
  process.execPath,
  [nextBinPath, ...nextArgs],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS: mergedNodeOptions
    }
  }
)

child.on('exit', (code, signal) => {
  if (signal != null) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})
