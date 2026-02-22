import type {BundleKey, RuntimeBundleItem, RuntimeBundles} from './index'

import {describe, expect, it} from 'vitest'
import {bundles} from './index'

describe('init-bundle exports', () => {
  describe('bundles', () => {
    it('should exist and be a valid object', () => {
      expect(bundles).toBeDefined()
      expect(typeof bundles).toBe('object')
    })

    it('should have expected bundle keys', () => {
      const expectedKeys = [
        'app/global.cn.mdx',
        '.vscode/settings.json',
        '.editorconfig',
        'public/tnmsc.example.json'
      ]
      expectedKeys.forEach(key => expect(bundles).toHaveProperty(key))
    })

    it('each bundle should have path and content, where path = key', () => {
      for (const [key, bundle] of Object.entries(bundles)) {
        expect(bundle).toHaveProperty('path')
        expect(bundle).toHaveProperty('content')

        expect(bundle.path).toBe(key) // path = key

        expect(bundle.content.length).toBeGreaterThan(0) // content 应该是实际内容（非空）
      }
    })

    describe('specific bundles', () => {
      it('app/global.cn.mdx should have matching path', () => expect(bundles['app/global.cn.mdx'].path).toBe('app/global.cn.mdx'))

      it('.vscode/settings.json should have matching path', () => expect(bundles['.vscode/settings.json'].path).toBe('.vscode/settings.json'))

      it('public/tnmsc.example.json should be valid JSON', () => {
        const {content} = bundles['public/tnmsc.example.json']
        expect(() => JSON.parse(content)).not.toThrow()

        const parsed = JSON.parse(content)
        expect(parsed).toHaveProperty('workspaceDir')
        expect(parsed).toHaveProperty('profile')
      })
    })
  })

  describe('type exports', () => {
    it('bundleKey type should work as string literal union', () => {
      const key: BundleKey = 'app/global.cn.mdx'
      expect(key).toBe('app/global.cn.mdx')
    })

    it('runtimeBundleItem type should work', () => {
      const item: RuntimeBundleItem = {path: 'test/path', content: 'test content'}
      expect(item.path).toBe('test/path')
    })

    it('runtimeBundles type should work', () => {
      const testBundles: RuntimeBundles = bundles
      expect(testBundles['app/global.cn.mdx']).toBeDefined()
    })
  })
})
