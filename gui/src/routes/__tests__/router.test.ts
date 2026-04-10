/**
 * Unit Tests for Router Configuration
 *
 * Validates:
 * - Requirements 2.1: Router uses hash history
 * - Requirements 2.3: Router initialized with auto-generated route tree
 * - Requirements 7.2: NotFound component provides link back to dashboard
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createHashHistory } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'

import NotFound from '@/components/NotFound'
import { routeTree } from '@/routeTree.gen'

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Creates a minimal mock window for createHashHistory in Node.js environment.
 * Reuses the same pattern established in the property tests.
 */
function createMockWindow() {
  const location = {
    pathname: '/',
    search: '',
    hash: '',
    href: '/',
  }

  const stateStack: Array<{ state: unknown; url: string }> = [
    { state: null, url: '/' },
  ]
  let stateIndex = 0

  const history = {
    get state() {
      return stateStack[stateIndex]?.state ?? null
    },
    get length() {
      return stateStack.length
    },
    pushState(state: unknown, _title: string, url?: string) {
      if (url != null) {
        const hashIdx = url.indexOf('#')
        location.hash = hashIdx >= 0 ? url.substring(hashIdx) : ''
        location.href = url
      }
      stateIndex++
      stateStack.splice(stateIndex, stateStack.length - stateIndex, {
        state,
        url: url ?? location.href,
      })
    },
    replaceState(state: unknown, _title: string, url?: string) {
      if (url != null) {
        const hashIdx = url.indexOf('#')
        location.hash = hashIdx >= 0 ? url.substring(hashIdx) : ''
        location.href = url
      }
      stateStack[stateIndex] = {
        state,
        url: url ?? location.href,
      }
    },
    back() {
      if (stateIndex > 0) stateIndex--
    },
    forward() {
      if (stateIndex < stateStack.length - 1) stateIndex++
    },
    go(n: number) {
      stateIndex = Math.min(
        Math.max(stateIndex + n, 0),
        stateStack.length - 1,
      )
    },
  }

  const listeners = new Map<string, Set<(...args: readonly unknown[]) => void>>()

  return {
    location,
    history,
    addEventListener(event: string, handler: (...args: readonly unknown[]) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(handler)
    },
    removeEventListener(event: string, handler: (...args: readonly unknown[]) => void) {
      listeners.get(event)?.delete(handler)
    },
  }
}

// ── Test 1: Router uses hash history (Req 2.1) ────────────────────────

describe('Router uses hash history', () => {
  it('createHashHistory produces URLs containing # for root path', () => {
    const win = createMockWindow()
    const history = createHashHistory({ window: win })

    const href = history.createHref('/')
    expect(href).toContain('#')

    history.destroy()
  })

  it('hash history places the route path after the # character', () => {
    const win = createMockWindow()
    const history = createHashHistory({ window: win })

    const href = history.createHref('/settings')
    const hashIndex = href.indexOf('#')
    const afterHash = href.substring(hashIndex + 1)
    expect(afterHash).toBe('/settings')

    history.destroy()
  })

  it('router.ts source uses createHashHistory from @tanstack/react-router', () => {
    const routerPath = resolve(__dirname, '../../router.ts')
    const source = readFileSync(routerPath, 'utf-8')

    expect(source).toContain('createHashHistory')
    expect(source).toMatch(/import\s.*createHashHistory.*from\s+['"]@tanstack\/react-router['"]/)
    expect(source).toMatch(/createRouter\(\s*\{/)
  })
})

// ── Test 2: Route tree contains all 7 route paths (Req 2.3) ──────────

describe('Route tree contains all 7 route paths', () => {
  const EXPECTED_PATHS = [
    '/',
    '/pipeline',
    '/config',
    '/adaptors',
    '/logs',
    '/settings',
    '/files',
  ] as const

  it('route tree has children covering all 7 defined paths', () => {
    const children = (
      routeTree as unknown as {
        children?: Record<string, { options?: { path?: string }; id?: string }>
      }
    ).children

    expect(children).toBeDefined()

    const childPaths = Object.values(children!).map(
      (child) => child.options?.path ?? child.id,
    )

    for (const expectedPath of EXPECTED_PATHS) {
      expect(childPaths).toContain(expectedPath)
    }
  })

  it('route tree has exactly 7 child routes', () => {
    const children = (
      routeTree as unknown as {
        children?: Record<string, unknown>
      }
    ).children

    expect(children).toBeDefined()
    expect(Object.keys(children!)).toHaveLength(7)
  })
})

// ── Test 3: NotFound component renders link to dashboard (Req 7.2) ────

describe('NotFound component renders link to dashboard', () => {
  it('NotFound is a function component', () => {
    expect(typeof NotFound).toBe('function')
  })

  it('NotFound.tsx source contains a Link to="/" from @tanstack/react-router', () => {
    const notFoundPath = resolve(__dirname, '../../components/NotFound.tsx')
    const source = readFileSync(notFoundPath, 'utf-8')

    // Verify it imports Link from @tanstack/react-router
    expect(source).toContain('@tanstack/react-router')
    expect(source).toMatch(/import\s.*Link.*from\s+['"]@tanstack\/react-router['"]/)

    // Verify it contains a Link pointing to the dashboard route "/"
    expect(source).toMatch(/<Link\s[^>]*to=["']\/["']/)
  })
})
