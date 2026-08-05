#!/usr/bin/env bun
import {readFile, writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'

import {zipSync} from 'fflate'

interface Manifest {
  version: string
}

const rootDir = resolve(import.meta.dirname, '..')
const distDir = resolve(rootDir, 'dist')
const requiredFiles = ['main.js', 'manifest.json', 'styles.css'] as const
const entries = Object.fromEntries(await Promise.all(
  requiredFiles.map(async file => [file, new Uint8Array(await readFile(resolve(distDir, file)))] as const),
))
const manifest = JSON.parse(new TextDecoder().decode(entries['manifest.json'])) as Manifest
const archivePath = resolve(distDir, `tnmso-${manifest.version}.zip`)

await writeFile(archivePath, zipSync(entries, {level: 9}))
