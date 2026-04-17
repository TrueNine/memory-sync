import {spawn} from 'node:child_process'
import process from 'node:process'
import {resolveTnmscBinary} from './resolve-binary'

const CLI_NAME = 'tnmsc'

export function getCliVersion(): string {
  return typeof __CLI_VERSION__ !== 'undefined' ? __CLI_VERSION__ : 'dev'
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function runCli(argv: readonly string[] = process.argv): Promise<number> {
  try {
    const binaryPath = resolveTnmscBinary()
    const args = argv.slice(2)

    return await new Promise((resolve, reject) => {
      const child = spawn(binaryPath, args, {
        cwd: process.cwd(),
        env: process.env,
        stdio: 'inherit'
      })

      child.on('error', reject)
      child.on('exit', (code, signal) => {
        if (signal != null) {
          reject(new Error(`${CLI_NAME} native process exited from signal ${signal}`))
          return
        }

        resolve(code ?? 1)
      })
    })
  } catch (error) {
    process.stderr.write(`[${CLI_NAME}] ${toErrorMessage(error)}\n`)
    return 1
  }
}
