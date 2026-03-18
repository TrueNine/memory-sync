'use strict'

const {readdirSync} = require('node:fs')
const {join} = require('node:path')

const EXPORT_BINDINGS = [
  ['logger', 'napi-logger.'],
  ['mdCompiler', 'napi-md-compiler.'],
  ['scriptRuntime', 'napi-script-runtime.'],
  ['config', 'napi-memory-sync-cli.']
]

const nodeFiles = readdirSync(__dirname).filter(file => file.endsWith('.node'))
const bindings = {}

for (const [exportName, prefix] of EXPORT_BINDINGS) {
  const file = nodeFiles.find(candidate => candidate.startsWith(prefix))
  if (file == null) continue

  Object.defineProperty(bindings, exportName, {
    enumerable: true,
    get() {
      return require(join(__dirname, file))
    }
  })
}

module.exports = bindings
