import {readFileSync} from 'node:fs'
import process from 'node:process'
import {resolvePublicPathUnchecked} from '@truenine/script-runtime'

async function main(): Promise<void> {
  const [, , filePath, ctxJsonPath, logicalPath] = process.argv
  if (filePath == null || ctxJsonPath == null || logicalPath == null) throw new Error('Usage: script-runtime-worker <file-path> <ctx-json-path> <logical-path>')

  const ctxJson = readFileSync(ctxJsonPath, 'utf8')
  const ctx = JSON.parse(ctxJson) as Parameters<typeof resolvePublicPathUnchecked>[1]
  const result = await resolvePublicPathUnchecked(filePath, ctx, logicalPath)
  process.stdout.write(`${result}\n`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exit(1)
})
