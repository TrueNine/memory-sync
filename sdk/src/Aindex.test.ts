import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {checkVersionControl} from './Aindex'

describe('checkVersionControl', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const tempDir of tempDirs.splice(0)) {
      fs.rmSync(tempDir, {recursive: true, force: true})
    }
  })

  it('accepts an aindex directory inside a parent git repository', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-aindex-git-parent-'))
    tempDirs.push(workspaceDir)
    fs.mkdirSync(path.join(workspaceDir, '.git'))
    const aindexDir = path.join(workspaceDir, 'aindex')
    fs.mkdirSync(aindexDir)

    const result = checkVersionControl(aindexDir)

    expect(result.hasGit).toBe(true)
    expect(result.gitPath).toBe(path.join(workspaceDir, '.git'))
  })
})
