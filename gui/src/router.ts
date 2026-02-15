import { createHashHistory, createRouter } from '@tanstack/react-router'
import PageLoading from './components/PageLoading'
import { routeTree } from './routeTree.gen'

const hashHistory = createHashHistory()

export const router = createRouter({
  routeTree,
  history: hashHistory,
  defaultPreload: 'intent',
  defaultPendingComponent: PageLoading,
  defaultPendingMinMs: 0,
  defaultPendingMs: 0,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
