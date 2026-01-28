import {describe, it} from 'vitest'
import defineConfig from 'memory-sync-cli/src/plugin.config'

describe('a', () => {
  it('a', () => {
    const r = defineConfig
    console.log(r)
    console.log('a')
  })
})
