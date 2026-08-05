#!/usr/bin/env bun
import {readdir, readFile, stat} from 'node:fs/promises'
import {resolve} from 'node:path'

import {unzipSync} from 'fflate'

interface Manifest {
  author: string
  description: string
  id: string
  isDesktopOnly: boolean
  minAppVersion: string
  name: string
  version: string
}

interface PackageJson {
  version: string
}

const rootDir = resolve(import.meta.dirname, '..')
const repoDir = resolve(rootDir, '..')
const distDir = resolve(rootDir, 'dist')
const files = (await readdir(distDir)).sort()
const requiredFiles = ['main.js', 'manifest.json', 'styles.css']
const semanticVersion = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u

for (const file of requiredFiles) {
  if (!files.includes(file)) throw new Error(`Missing release file: ${file}`)
}

const [manifest, sourceManifest, packageJson, rootPackageJson, rootVersions, pluginVersions, mainStat, mainSource] = await Promise.all([
  readFile(resolve(distDir, 'manifest.json'), 'utf8').then(value => JSON.parse(value) as Manifest),
  readFile(resolve(rootDir, 'manifest.json'), 'utf8').then(value => JSON.parse(value) as Manifest),
  readFile(resolve(rootDir, 'package.json'), 'utf8').then(value => JSON.parse(value) as PackageJson),
  readFile(resolve(repoDir, 'package.json'), 'utf8').then(value => JSON.parse(value) as PackageJson),
  readFile(resolve(repoDir, 'versions.json'), 'utf8').then(value => JSON.parse(value) as Record<string, string>),
  readFile(resolve(rootDir, 'versions.json'), 'utf8').then(value => JSON.parse(value) as Record<string, string>),
  stat(resolve(distDir, 'main.js')),
  readFile(resolve(distDir, 'main.js'), 'utf8'),
])

if (manifest.id !== 'tnmso' || manifest.name !== 'TNMSO') throw new Error('Unexpected plugin identity.')
if (!/^[a-z][a-z-]*$/u.test(manifest.id) || manifest.id.includes('obsidian') || manifest.id.endsWith('plugin')) {
  throw new Error(`Invalid Obsidian plugin id: ${manifest.id}`)
}
if (!semanticVersion.test(manifest.version) || !semanticVersion.test(manifest.minAppVersion)) {
  throw new Error('TNMSO version and minAppVersion must use x.y.z numeric versions.')
}
if (manifest.author.trim() === '' || manifest.description.length > 250 || !manifest.description.endsWith('.')) {
  throw new Error('TNMSO manifest author and store description do not meet submission requirements.')
}
if (typeof manifest.isDesktopOnly !== 'boolean') throw new Error('TNMSO isDesktopOnly must be a boolean.')
if (manifest.version !== packageJson.version || manifest.version !== rootPackageJson.version) {
  throw new Error('TNMSO manifest, plugin package, and repository versions differ.')
}
if (JSON.stringify(manifest) !== JSON.stringify(sourceManifest)) throw new Error('Built and source TNMSO manifests differ.')
if (rootVersions[manifest.version] !== manifest.minAppVersion || pluginVersions[manifest.version] !== manifest.minAppVersion) {
  throw new Error('TNMSO versions.json files must map the release to minAppVersion.')
}
if (mainStat.size < 1_024) throw new Error(`main.js is unexpectedly small: ${mainStat.size}`)
if (!mainSource.includes('require("obsidian")')) throw new Error('main.js must externalize the Obsidian API.')

const archiveName = `tnmso-${manifest.version}.zip`
if (files.includes(archiveName)) {
  const archive = unzipSync(new Uint8Array(await readFile(resolve(distDir, archiveName))))
  const archiveFiles = Object.keys(archive).sort()
  if (JSON.stringify(archiveFiles) !== JSON.stringify(requiredFiles)) {
    throw new Error(`Unexpected TNMSO archive contents: ${archiveFiles.join(', ')}`)
  }
}

console.log(`Validated TNMSO release files for ${manifest.version}`)
