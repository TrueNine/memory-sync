import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'fs-extra'
import { cleanBlankLines, cleanBlankLinesInFile } from './blankLineCleaner'

describe('blankLineCleaner', () => {
let tempDir: string

beforeEach(async () => {
tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'blank-line-test-'))
})

afterEach(async () => {
await fs.remove(tempDir)
})

describe('cleanBlankLinesInFile', () => {
it('should remove indentation from blank lines', async () => {
const filePath = path.join(tempDir, 'test.md')
const content = 'line1\n  \nline2\n\t\nline3'
await fs.writeFile(filePath, content)

const modified = await cleanBlankLinesInFile(filePath)
const result = await fs.readFile(filePath, 'utf-8')

expect(modified).toBe(true)
expect(result).toBe('line1\n\nline2\n\nline3')
})

it('should not modify files without indented blank lines', async () => {
const filePath = path.join(tempDir, 'test.md')
const content = 'line1\n\nline2\n\nline3'
await fs.writeFile(filePath, content)

const modified = await cleanBlankLinesInFile(filePath)
const result = await fs.readFile(filePath, 'utf-8')

expect(modified).toBe(false)
expect(result).toBe(content)
})

it('should preserve non-blank line indentation', async () => {
const filePath = path.join(tempDir, 'test.md')
const content = 'line1\n  indented\n  \nline2'
await fs.writeFile(filePath, content)

const modified = await cleanBlankLinesInFile(filePath)
const result = await fs.readFile(filePath, 'utf-8')

expect(modified).toBe(true)
expect(result).toBe('line1\n  indented\n\nline2')
})

it('should handle mixed space and tab indentation', async () => {
const filePath = path.join(tempDir, 'test.md')
const content = 'line1\n \t \nline2\n\t \t\nline3'
await fs.writeFile(filePath, content)

const modified = await cleanBlankLinesInFile(filePath)
const result = await fs.readFile(filePath, 'utf-8')

expect(modified).toBe(true)
expect(result).toBe('line1\n\nline2\n\nline3')
})

it('should return false for non-existent files', async () => {
const filePath = path.join(tempDir, 'non-existent.md')
const modified = await cleanBlankLinesInFile(filePath)

expect(modified).toBe(false)
})
})

describe('cleanBlankLines', () => {
it('should process multiple files in a directory', async () => {
await fs.writeFile(path.join(tempDir, 'file1.md'), 'line1\n  \nline2')
await fs.writeFile(path.join(tempDir, 'file2.md'), 'line1\n\t\nline2')
await fs.writeFile(path.join(tempDir, 'file3.md'), 'line1\n\nline2')

const result = await cleanBlankLines({
baseDir: tempDir,
extensions: ['.md'],
})

expect(result.processedCount).toBe(3)
expect(result.modifiedCount).toBe(2)
expect(result.modifiedFiles).toHaveLength(2)
})

it('should respect extension filters', async () => {
await fs.writeFile(path.join(tempDir, 'test.md'), 'line1\n  \nline2')
await fs.writeFile(path.join(tempDir, 'test.ts'), 'line1\n  \nline2')

const result = await cleanBlankLines({
baseDir: tempDir,
extensions: ['.md'],
})

expect(result.processedCount).toBe(1)
expect(result.modifiedCount).toBe(1)
})

it('should skip node_modules by default', async () => {
const nodeModulesDir = path.join(tempDir, 'node_modules')
await fs.ensureDir(nodeModulesDir)
await fs.writeFile(path.join(nodeModulesDir, 'test.md'), 'line1\n  \nline2')
await fs.writeFile(path.join(tempDir, 'test.md'), 'line1\n  \nline2')

const result = await cleanBlankLines({
baseDir: tempDir,
extensions: ['.md'],
})

expect(result.processedCount).toBe(1)
expect(result.modifiedCount).toBe(1)
})

it('should process nested directories', async () => {
const subDir = path.join(tempDir, 'sub')
await fs.ensureDir(subDir)
await fs.writeFile(path.join(tempDir, 'test1.md'), 'line1\n  \nline2')
await fs.writeFile(path.join(subDir, 'test2.md'), 'line1\n  \nline2')

const result = await cleanBlankLines({
baseDir: tempDir,
extensions: ['.md'],
})

expect(result.processedCount).toBe(2)
expect(result.modifiedCount).toBe(2)
})

it('should support dry run mode', async () => {
const filePath = path.join(tempDir, 'test.md')
const content = 'line1\n  \nline2'
await fs.writeFile(filePath, content)

const result = await cleanBlankLines({
baseDir: tempDir,
extensions: ['.md'],
dryRun: true,
})

const fileContent = await fs.readFile(filePath, 'utf-8')

expect(result.modifiedCount).toBe(1)
expect(fileContent).toBe(content) // File should not be modified
})

it('should process all files when no extension filter is provided', async () => {
await fs.writeFile(path.join(tempDir, 'test.md'), 'line1\n  \nline2')
await fs.writeFile(path.join(tempDir, 'test.ts'), 'line1\n  \nline2')
await fs.writeFile(path.join(tempDir, 'test.txt'), 'line1\n  \nline2')

const result = await cleanBlankLines({
baseDir: tempDir,
})

expect(result.processedCount).toBe(3)
expect(result.modifiedCount).toBe(3)
})

it('should respect custom skipDirs', async () => {
const customDir = path.join(tempDir, 'custom')
await fs.ensureDir(customDir)
await fs.writeFile(path.join(customDir, 'test.md'), 'line1\n  \nline2')
await fs.writeFile(path.join(tempDir, 'test.md'), 'line1\n  \nline2')

const result = await cleanBlankLines({
baseDir: tempDir,
extensions: ['.md'],
skipDirs: ['custom'],
})

expect(result.processedCount).toBe(1)
expect(result.modifiedCount).toBe(1)
})
})
})

