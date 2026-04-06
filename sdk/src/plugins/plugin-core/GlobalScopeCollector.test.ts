import {describe, expect, it} from 'vitest'
import {GlobalScopeCollector} from './GlobalScopeCollector'

describe('global scope collector', () => {
  it('injects default codeStyles when the user config omits them', () => {
    const collector = new GlobalScopeCollector()

    const scope = collector.collect()

    expect(scope.codeStyles).toEqual({
      indent: 'space',
      tabSize: 2
    })
  })

  it('collects codeStyles from the user config file', () => {
    const collector = new GlobalScopeCollector({
      userConfig: {
        codeStyles: {
          indent: 'space',
          tabSize: 2,
          quoteStyle: 'single'
        }
      }
    })

    const scope = collector.collect()

    expect(scope.codeStyles).toEqual({
      indent: 'space',
      tabSize: 2,
      quoteStyle: 'single'
    })
  })

  it('merges default codeStyles with partial user config values', () => {
    const collector = new GlobalScopeCollector({
      userConfig: {
        codeStyles: {
          tabSize: 4
        }
      }
    })

    const scope = collector.collect()

    expect(scope.codeStyles).toEqual({
      indent: 'space',
      tabSize: 4
    })
  })
})
