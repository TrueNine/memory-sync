import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {ConfigLoader, getGlobalConfigPath} from './ConfigLoader'

describe('configLoader', () => {
  const originalHome = process.env.HOME
  const originalUserProfile = process.env.USERPROFILE
  const originalHomeDrive = process.env.HOMEDRIVE
  const originalHomePath = process.env.HOMEPATH

  afterEach(() => {
    process.env.HOME = originalHome
    process.env.USERPROFILE = originalUserProfile
    process.env.HOMEDRIVE = originalHomeDrive
    process.env.HOMEPATH = originalHomePath
  })

  it('searches only the canonical global config path', () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tnmsc-home-'))
    process.env.HOME = tempHome
    process.env.USERPROFILE = tempHome
    delete process.env.HOMEDRIVE
    delete process.env.HOMEPATH

    try {
      const loader = new ConfigLoader()
      expect(loader.getSearchPaths(path.join(tempHome, 'workspace'))).toEqual([getGlobalConfigPath()])
    }
    finally {
      fs.rmSync(tempHome, {recursive: true, force: true})
    }
  })
})
