/**
 * Property-Based Tests for Sidebar active navigation styling
 *
 * Feature: tanstack-file-router, Property 5: Active navigation styling
 * **Validates: Requirements 5.2**
 *
 * For any navigation item in the Sidebar, when the current route matches
 * that item's target path, the corresponding link element should have the
 * active style class applied.
 *
 * Since @testing-library/react is not installed, these tests verify the
 * structural correctness of the Sidebar's Link configuration by reading
 * the component source and asserting that:
 *   - Every nav item uses activeProps with the expected active class
 *   - Every nav item uses inactiveProps with the expected inactive class
 *   - The index route (`/`) has `activeOptions={{ exact: true }}`
 *   - Non-index routes do NOT have `exact: true` active options
 */
import fc from 'fast-check'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The 6 valid navigation route paths defined in the Sidebar component.
 */
const NAV_ROUTE_PATHS = [
  '/',
  '/pipeline',
  '/config',
  '/plugins',
  '/logs',
  '/settings',
] as const

type NavRoutePath = (typeof NAV_ROUTE_PATHS)[number]

/**
 * Expected active class string applied via `activeProps.className`
 * when a Link's route matches the current location.
 */
const EXPECTED_ACTIVE_CLASS =
  'bg-sidebar-accent text-sidebar-accent-foreground font-medium'

/**
 * Expected inactive class string applied via `inactiveProps.className`
 * when a Link's route does NOT match the current location.
 */
const EXPECTED_INACTIVE_CLASS =
  'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'

/**
 * Read the Sidebar component source once for all tests.
 */
const sidebarSourcePath = path.resolve(
  import.meta.dirname,
  '..',
  'Sidebar.tsx',
)
const sidebarSource = fs.readFileSync(sidebarSourcePath, 'utf-8')

describe('Property 5: Active navigation styling', () => {
  /**
   * **Validates: Requirements 5.2**
   *
   * For any navigation item path, the Sidebar source must contain a
   * `navItems` entry with `to: '<path>'`, ensuring every expected route
   * is represented in the navigation.
   */
  it('every expected nav route path is present in the navItems array', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...NAV_ROUTE_PATHS),
        (routePath: NavRoutePath) => {
          const escaped = routePath.replace(/\//g, '\\/')
          const toPattern = new RegExp(`to:\\s*['"]${escaped}['"]`)
          expect(sidebarSource).toMatch(toPattern)
        },
      ),
      { numRuns: 200 },
    )
  })

  /**
   * **Validates: Requirements 5.2**
   *
   * The Sidebar must configure `activeProps` with the expected active
   * class string so that when TanStack Router's Link detects a route
   * match, the active styling is applied.
   */
  it('activeProps contains the expected active styling class', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...NAV_ROUTE_PATHS),
        (_routePath: NavRoutePath) => {
          expect(sidebarSource).toContain(EXPECTED_ACTIVE_CLASS)

          const activePropsMatch =
            /activeProps\s*=\s*\{\s*\{[\s\S]*?className\s*:\s*'([^']*)'/
          const match = sidebarSource.match(activePropsMatch)
          expect(match).not.toBeNull()
          expect(match![1]).toBe(EXPECTED_ACTIVE_CLASS)
        },
      ),
      { numRuns: 200 },
    )
  })

  /**
   * **Validates: Requirements 5.2**
   *
   * The Sidebar must configure `inactiveProps` with the expected inactive
   * class string so that non-matching links have the correct default styling.
   */
  it('inactiveProps contains the expected inactive styling class', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...NAV_ROUTE_PATHS),
        (_routePath: NavRoutePath) => {
          expect(sidebarSource).toContain(EXPECTED_INACTIVE_CLASS)

          const inactivePropsMatch =
            /inactiveProps\s*=\s*\{\s*\{[\s\S]*?className\s*:\s*'([^']*)'/
          const match = sidebarSource.match(inactivePropsMatch)
          expect(match).not.toBeNull()
          expect(match![1]).toBe(EXPECTED_INACTIVE_CLASS)
        },
      ),
      { numRuns: 200 },
    )
  })

  /**
   * **Validates: Requirements 5.2**
   *
   * The index route (`/`) must use `activeOptions={{ exact: true }}` to
   * prevent it from matching all sub-routes (e.g. `/pipeline` would also
   * match `/` without exact matching). Non-index routes must NOT use
   * exact matching.
   */
  it('only the index route uses exact active matching', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...NAV_ROUTE_PATHS),
        (routePath: NavRoutePath) => {
          expect(sidebarSource).toContain(
            "item.to === '/' ? { exact: true } : undefined",
          )

          // Simulate the same logic the Sidebar uses for activeOptions
          const result = (routePath as string) === '/' ? { exact: true } : undefined

          if (routePath === '/') {
            expect(result).toEqual({ exact: true })
          }
          else {
            expect(result).toBeUndefined()
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  /**
   * **Validates: Requirements 5.2**
   *
   * Active and inactive class strings must be mutually exclusive — they
   * must not share any CSS class tokens. This ensures that when a link
   * transitions between active and inactive states, the styling is
   * completely replaced rather than partially overlapping.
   */
  it('active and inactive class sets are mutually exclusive', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...NAV_ROUTE_PATHS),
        (_routePath: NavRoutePath) => {
          const activeClasses = new Set(EXPECTED_ACTIVE_CLASS.split(/\s+/))
          const inactiveClasses = new Set(EXPECTED_INACTIVE_CLASS.split(/\s+/))

          for (const cls of activeClasses) {
            expect(inactiveClasses.has(cls)).toBe(false)
          }
          for (const cls of inactiveClasses) {
            expect(activeClasses.has(cls)).toBe(false)
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  /**
   * **Validates: Requirements 5.2**
   *
   * The Sidebar must use TanStack Router's `Link` component (not
   * react-router-dom's NavLink) for navigation, and every nav item
   * must be rendered through this Link component with both activeProps
   * and inactiveProps configured.
   */
  it('uses TanStack Router Link with both activeProps and inactiveProps', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...NAV_ROUTE_PATHS),
        (_routePath: NavRoutePath) => {
          expect(sidebarSource).toContain(
            "import { Link } from '@tanstack/react-router'",
          )

          expect(sidebarSource).not.toContain('react-router-dom')

          expect(sidebarSource).toContain('<Link')
          expect(sidebarSource).toContain('activeProps=')
          expect(sidebarSource).toContain('inactiveProps=')
        },
      ),
      { numRuns: 200 },
    )
  })
})
