import { describe, expect, it } from 'vitest'
import { getAllFiles, getFirstLevelDirs } from './fs'

describe('File System Utils', () => {
  describe('getAllFiles', () => {
    it('should return empty array for non-existent directory', async () => {
      const files = await getAllFiles('/non/existent/path')
      expect(files).toEqual([])
    })
  })

  describe('getFirstLevelDirs', () => {
    it('should return empty array for non-existent directory', async () => {
      const dirs = await getFirstLevelDirs('/non/existent/path')
      expect(dirs).toEqual([])
    })
  })
})

