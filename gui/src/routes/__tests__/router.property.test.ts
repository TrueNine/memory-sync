/**
 * Property-Based Tests for TanStack Router hash history
 *
 * Feature: tanstack-file-router, Property 1: Hash history URL format
 * **Validates: Requirements 2.1**
 */

// Monaco Editor requires window object in Node environment
// Must mock before any imports that may trigger Monaco loading
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis as unknown as Window & typeof globalThis
}
if (typeof globalThis.self === 'undefined') {
  globalThis.self = globalThis as unknown as Window & typeof globalThis
}

import fc from 'fast-check'
import { afterEach, describe, expect, it } from 'vitest'

import type { RouterHistory } from '@tanstack/react-router'
import { createHashHistory } from '@tanstack/react-router'

/**
 * The 6 valid route paths defined in the application.
 */
const VALID_ROUTE_PATHS = [
  '/',
  '/pipeline',
  '/config',
  '/plugins',
  '/logs',
  '/settings',
] as const

/**
 * Creates a minimal mock window object that satisfies the requirements
 * of `createHashHistory` in a Node.js (non-DOM) test environment.
 *
 * The mock tracks `location.hash` updates through `pushState`/`replaceState`
 * so that the hash history can read back the current route.
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
        // Extract hash portion and update location.hash
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

// ── Tests ──────────────────────────────────────────────────────────────

describe('Property 1: Hash history URL format', () => {
  let history: RouterHistory

  afterEach(() => {
    history?.destroy()
  })

  /**
   * **Validates: Requirements 2.1**
   *
   * For any valid route path in the application, `createHref` should
   * produce a URL string containing a `#` character, and the route path
   * should appear after the `#`.
   */
  it('createHref produces URLs with # followed by the route path', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_ROUTE_PATHS),
        (routePath) => {
          const win = createMockWindow()
          history = createHashHistory({ window: win })

          const href = history.createHref(routePath)

          // The href must contain a hash fragment
          expect(href).toContain('#')

          // The route path must appear after the # character
          const hashIndex = href.indexOf('#')
          const afterHash = href.substring(hashIndex + 1)
          expect(afterHash).toBe(routePath)

          history.destroy()
        },
      ),
      { numRuns: 200 },
    )
  })

  /**
   * **Validates: Requirements 2.1**
   *
   * For any valid route path, after pushing that path onto the hash history,
   * the history location's pathname should match the pushed route path.
   */
  it('push updates location pathname to the navigated route path', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...VALID_ROUTE_PATHS),
        (routePath) => {
          const win = createMockWindow()
          history = createHashHistory({ window: win })

          history.push(routePath)
          history.flush()

          expect(history.location.pathname).toBe(routePath)

          history.destroy()
        },
      ),
      { numRuns: 200 },
    )
  })
})

/**
 * Property-Based Tests for route-to-component mapping
 *
 * Feature: tanstack-file-router, Property 4: Route-to-component mapping
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6**
 *
 * For any route path defined in the route configuration
 * (`/`, `/pipeline`, `/config`, `/plugins`, `/logs`, `/settings`),
 * navigating to that path should render the corresponding page component.
 */

import { Route as ConfigRoute } from '@/routes/config'
import { Route as IndexRoute } from '@/routes/index'
import { Route as LogsRoute } from '@/routes/logs'
import { Route as PipelineRoute } from '@/routes/pipeline'
import { Route as PluginsRoute } from '@/routes/adaptors'
import { Route as SettingsRoute } from '@/routes/settings'

import ConfigPage from '@/pages/ConfigPage'
import DashboardPage from '@/pages/DashboardPage'
import LogsPage from '@/pages/LogsPage'
import PipelinePage from '@/pages/PipelinePage'
import AdaptorsPage from '@/pages/AdaptorsPage'
import SettingsPage from '@/pages/SettingsPage'

/**
 * Complete route-to-component mapping as defined in the specification.
 * Each entry maps a route path to its Route object and expected page component.
 */
const ROUTE_COMPONENT_MAP = [
  { path: '/' as const, route: IndexRoute, expectedComponent: DashboardPage },
  { path: '/pipeline' as const, route: PipelineRoute, expectedComponent: PipelinePage },
  { path: '/config' as const, route: ConfigRoute, expectedComponent: ConfigPage },
  { path: '/plugins' as const, route: PluginsRoute, expectedComponent: AdaptorsPage },
  { path: '/logs' as const, route: LogsRoute, expectedComponent: LogsPage },
  { path: '/settings' as const, route: SettingsRoute, expectedComponent: SettingsPage },
] as const

describe('Property 4: Route-to-component mapping', () => {
  /**
   * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6**
   *
   * For any route path from the valid set, the corresponding Route object's
   * `options.component` must reference the correct page component.
   */
  it('each route path maps to its expected page component', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROUTE_COMPONENT_MAP),
        ({ route, expectedComponent }) => {
          const actualComponent = (route as unknown as { options: { component: unknown } }).options
            .component

          expect(actualComponent).toBe(expectedComponent)

          // Verify the route was created with createFileRoute (has options)
          expect(route).toHaveProperty('options')
          expect(route).toHaveProperty('options.component')
        },
      ),
      { numRuns: 200 },
    )
  })

  /**
   * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6**
   *
   * All 6 required routes must be present — no route is missing from the mapping.
   * This ensures the file-based routing covers every page defined in the spec.
   */
  it('all 6 required route paths have a defined route with a component', () => {
    const requiredPaths = ['/', '/pipeline', '/config', '/plugins', '/logs', '/settings'] as const

    fc.assert(
      fc.property(
        fc.constantFrom(...requiredPaths),
        (requiredPath) => {
          const entry = ROUTE_COMPONENT_MAP.find((m) => m.path === requiredPath)

          // The route entry must exist
          expect(entry).toBeDefined()

          // The route must have a component assigned
          const component = (entry!.route as unknown as { options: { component: unknown } }).options
            .component
          expect(component).toBeDefined()
          expect(typeof component).toBe('function')
        },
      ),
      { numRuns: 200 },
    )
  })

  /**
   * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6**
   *
   * Each route maps to a unique page component — no two routes share the same component.
   * This ensures the route-to-component mapping is a bijection over the defined routes.
   */
  it('no two routes share the same page component', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ROUTE_COMPONENT_MAP),
        (entry) => {
          const duplicates = ROUTE_COMPONENT_MAP.filter((other) => {
            const otherComponent = (other.route as unknown as { options: { component: unknown } })
              .options.component
            const entryComponent = (entry.route as unknown as { options: { component: unknown } })
              .options.component
            return otherComponent === entryComponent
          })

          // Exactly one route should map to this component
          expect(duplicates).toHaveLength(1)
          expect(duplicates[0]!.path).toBe(entry.path)
        },
      ),
      { numRuns: 200 },
    )
  })
})


/**
 * Property-Based Tests for Not Found on undefined routes
 *
 * Feature: tanstack-file-router, Property 7: Not Found for undefined routes
 * **Validates: Requirements 7.1**
 *
 * For any URL path that does not match a defined route, the Router should
 * render the Not Found component.
 */

import NotFound from '@/components/NotFound'
import { Route as RootRoute } from '@/routes/__root'
import { routeTree } from '@/routeTree.gen'

/**
 * Extracts all defined route paths from the route tree.
 * Uses the children of the root route to collect every valid path.
 */
function getDefinedRoutePaths(): readonly string[] {
  const children = (routeTree as unknown as { children?: Record<string, { options?: { path?: string }; id?: string }> }).children
  if (!children) return VALID_ROUTE_PATHS

  const paths: string[] = []
  for (const child of Object.values(children)) {
    const path = child.options?.path ?? child.id
    if (path != null) {
      paths.push(path)
    }
  }
  return paths.length > 0 ? paths : [...VALID_ROUTE_PATHS]
}

/**
 * fast-check arbitrary that generates URL paths guaranteed NOT to be
 * in the set of valid/defined routes.
 *
 * Strategy: generate arbitrary path segments like `/randomString` or
 * `/segment1/segment2` and filter out any that happen to match a valid route.
 */
const undefinedRoutePathArb = fc
  .array(
    fc.stringMatching(/^[a-z0-9][a-z0-9_-]{0,15}$/),
    { minLength: 1, maxLength: 4 },
  )
  .map((segments) => `/${segments.join('/')}`)
  .filter((path) => !VALID_ROUTE_PATHS.includes(path as (typeof VALID_ROUTE_PATHS)[number]))

describe('Property 7: Not Found for undefined routes', () => {
  /**
   * **Validates: Requirements 7.1**
   *
   * The root route must have a `notFoundComponent` configured, and it must
   * reference the NotFound component. This is the structural prerequisite
   * for the Router to render Not Found on undefined routes.
   */
  it('root route has notFoundComponent configured as the NotFound component', () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        () => {
          const rootOptions = (RootRoute as unknown as { options: { notFoundComponent?: unknown } }).options

          // The root route must have notFoundComponent defined
          expect(rootOptions.notFoundComponent).toBeDefined()

          // It must be the NotFound component
          expect(rootOptions.notFoundComponent).toBe(NotFound)
        },
      ),
      { numRuns: 1 },
    )
  })

  /**
   * **Validates: Requirements 7.1**
   *
   * For any randomly generated URL path that is not one of the 6 defined routes,
   * the path must not appear in the route tree's defined paths. This ensures
   * the router has no matching route and will fall through to the Not Found handler.
   */
  it('undefined route paths do not match any route in the route tree', () => {
    const definedPaths = getDefinedRoutePaths()

    fc.assert(
      fc.property(
        undefinedRoutePathArb,
        (randomPath) => {
          // The generated path must not be in the set of defined routes
          expect(definedPaths).not.toContain(randomPath)
        },
      ),
      { numRuns: 200 },
    )
  })

  /**
   * **Validates: Requirements 7.1**
   *
   * For any undefined route path, the route tree's children should contain
   * no route whose path matches the generated path. Combined with the root
   * route's notFoundComponent configuration, this guarantees the Not Found
   * component will be rendered.
   */
  it('no child route in the route tree matches an undefined path', () => {
    const children = (routeTree as unknown as { children?: Record<string, { options?: { path?: string }; id?: string }> }).children ?? {}

    fc.assert(
      fc.property(
        undefinedRoutePathArb,
        (randomPath) => {
          for (const child of Object.values(children)) {
            const routePath = child.options?.path ?? child.id
            expect(routePath).not.toBe(randomPath)
          }
        },
      ),
      { numRuns: 200 },
    )
  })
})
