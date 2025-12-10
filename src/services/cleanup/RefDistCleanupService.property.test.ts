import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'
import path from 'node:path'
import fs from 'fs-extra'
import os from 'node:os'
import { RefDistCleanupService } from './RefDistCleanupService'

/**
 * Feature: ref-dist-memory-sync, Property 1: Ref Dist Directory State
 * Validates: Requirements 1.3, 2.1, 2.2
 */
describe('RefDistCleanupService properties', () => {
    let tempDir: string
    let service: RefDistCleanupService

    // Generator for valid project names (alphanumeric, hyphen, underscore only)
    const validProjectName = fc.stringMatching(/^[a-zA-Z0-9_-]+$/, { minLength: 1, maxLength: 20 })

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ref-cleanup-test-'))
        service = new RefDistCleanupService()
    })

    afterEach(async () => {
        await fs.remove(tempDir)
    })

    it('should ensure ref/*/dist/ contains only allowed files after cleanup', async () => {
        await fc.assert(
            fc.asyncProperty(
                validProjectName,
                fc.array(
                    fc.constantFrom('.agent', '.codebuddy', '.kiro', '.qoder', '.windsurf'),
                    { minLength: 1, maxLength: 5 },
                ),
                fc.array(
                    fc.constantFrom('AGENTS.md', 'CLAUDE.md', 'README.md', 'other.txt', 'temp.log'),
                    { minLength: 1, maxLength: 5 },
                ),
                async (projectName, intermediateDirs, files) => {
                    const refPath = path.join(tempDir, 'ref')
                    const projectPath = path.join(refPath, projectName)
                    const distPath = path.join(projectPath, 'dist')

                    await fs.ensureDir(distPath)

                    for (const dirName of intermediateDirs) {
                        const dirPath = path.join(distPath, dirName)
                        await fs.ensureDir(dirPath)
                        await fs.writeFile(path.join(dirPath, 'dummy.txt'), 'content')
                    }

                    for (const fileName of files) {
                        await fs.writeFile(path.join(distPath, fileName), 'content')
                    }

                    const preserveFiles = ['AGENTS.md', 'CLAUDE.md', 'README.md']
                    await service.cleanRefDistDirectories({
                        refPath,
                        preserveFiles,
                    })

                    const remainingEntries = await fs.readdir(distPath, { withFileTypes: true })

                    for (const entry of remainingEntries) {
                        if (entry.isDirectory()) {
                            expect(['.agent', '.codebuddy', '.kiro', '.qoder', '.windsurf']).not.toContain(entry.name)
                        }
                        else if (entry.isFile()) {
                            expect(preserveFiles).toContain(entry.name)
                        }
                    }
                },
            ),
            { numRuns: 100 },
        )
    })

    it('should preserve allowed files during cleanup', async () => {
        await fc.assert(
            fc.asyncProperty(
                validProjectName,
                fc.subarray(['AGENTS.md', 'CLAUDE.md', 'README.md'], { minLength: 1 }),
                async (projectName, filesToCreate) => {
                    const refPath = path.join(tempDir, 'ref')
                    const projectPath = path.join(refPath, projectName)
                    const distPath = path.join(projectPath, 'dist')

                    await fs.ensureDir(distPath)

                    for (const fileName of filesToCreate) {
                        await fs.writeFile(path.join(distPath, fileName), `content-${fileName}`)
                    }

                    await fs.ensureDir(path.join(distPath, '.agent'))
                    await fs.ensureDir(path.join(distPath, '.qoder'))

                    const preserveFiles = ['AGENTS.md', 'CLAUDE.md', 'README.md']
                    await service.cleanRefDistDirectories({
                        refPath,
                        preserveFiles,
                    })

                    for (const fileName of filesToCreate) {
                        const filePath = path.join(distPath, fileName)
                        const exists = await fs.pathExists(filePath)
                        expect(exists).toBe(true)

                        const content = await fs.readFile(filePath, 'utf-8')
                        expect(content).toBe(`content-${fileName}`)
                    }
                },
            ),
            { numRuns: 100 },
        )
    })

    it('should remove all intermediate directories regardless of content', async () => {
        await fc.assert(
            fc.asyncProperty(
                validProjectName,
                fc.constantFrom('.agent', '.codebuddy', '.kiro', '.qoder', '.windsurf'),
                fc.nat({ max: 10 }),
                async (projectName, intermediateDirName, fileCount) => {
                    const refPath = path.join(tempDir, 'ref')
                    const projectPath = path.join(refPath, projectName)
                    const distPath = path.join(projectPath, 'dist')
                    const intermediateDirPath = path.join(distPath, intermediateDirName)

                    await fs.ensureDir(intermediateDirPath)

                    for (let i = 0; i < fileCount; i++) {
                        await fs.writeFile(path.join(intermediateDirPath, `file${i}.txt`), `content${i}`)
                    }

                    const preserveFiles = ['AGENTS.md', 'CLAUDE.md', 'README.md']
                    await service.cleanRefDistDirectories({
                        refPath,
                        preserveFiles,
                    })

                    const exists = await fs.pathExists(intermediateDirPath)
                    expect(exists).toBe(false)
                },
            ),
            { numRuns: 100 },
        )
    })

    it('should handle multiple projects consistently', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.array(validProjectName, { minLength: 1, maxLength: 5 }),
                async (projectNames) => {
                    const uniqueProjects = [...new Set(projectNames)]
                    const refPath = path.join(tempDir, 'ref')

                    for (const projectName of uniqueProjects) {
                        const distPath = path.join(refPath, projectName, 'dist')
                        await fs.ensureDir(distPath)

                        await fs.ensureDir(path.join(distPath, '.agent'))
                        await fs.ensureDir(path.join(distPath, '.qoder'))
                        await fs.writeFile(path.join(distPath, 'AGENTS.md'), 'content')
                        await fs.writeFile(path.join(distPath, 'temp.txt'), 'temp')
                    }

                    const preserveFiles = ['AGENTS.md', 'CLAUDE.md', 'README.md']
                    const result = await service.cleanRefDistDirectories({
                        refPath,
                        preserveFiles,
                    })

                    expect(result.cleaned).toBeGreaterThanOrEqual(uniqueProjects.length * 2)

                    for (const projectName of uniqueProjects) {
                        const distPath = path.join(refPath, projectName, 'dist')
                        const entries = await fs.readdir(distPath, { withFileTypes: true })

                        const dirs = entries.filter(e => e.isDirectory())
                        expect(dirs).toHaveLength(0)

                        const files = entries.filter(e => e.isFile())
                        for (const file of files) {
                            expect(preserveFiles).toContain(file.name)
                        }
                    }
                },
            ),
            { numRuns: 100 },
        )
    })

    it('should handle empty dist directories', async () => {
        await fc.assert(
            fc.asyncProperty(
                validProjectName,
                async (projectName) => {
                    const refPath = path.join(tempDir, 'ref')
                    const distPath = path.join(refPath, projectName, 'dist')

                    await fs.ensureDir(distPath)

                    const preserveFiles = ['AGENTS.md', 'CLAUDE.md', 'README.md']
                    const result = await service.cleanRefDistDirectories({
                        refPath,
                        preserveFiles,
                    })

                    expect(result.errors).toHaveLength(0)

                    const exists = await fs.pathExists(distPath)
                    expect(exists).toBe(true)

                    const entries = await fs.readdir(distPath)
                    expect(entries).toHaveLength(0)
                },
            ),
            { numRuns: 100 },
        )
    })
})
