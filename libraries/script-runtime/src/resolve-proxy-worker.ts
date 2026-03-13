import {readFileSync} from 'node:fs'
import process from 'node:process'
import {resolvePublicPathModule} from './runtime-core'

async function main(): Promise<void> {
  const [, , filePath, ctxJsonPath, logicalPath] = process.argv
  if (filePath == null || ctxJsonPath == null || logicalPath == null) throw new Error('Usage: resolve-proxy-worker <file-path> <ctx-json-path> <logical-path>')

  const ctxJson = readFileSync(ctxJsonPath, 'utf8')
  const ctx = JSON.parse(ctxJson) as Parameters<typeof resolvePublicPathModule>[1]
  const result = await resolvePublicPathModule(filePath, ctx, logicalPath)
  process.stdout.write(`${result}\n`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exit(1)
})
