import { createRootRoute, Outlet } from '@tanstack/react-router'

import CliMissingBanner from '@/components/CliMissingBanner'
import Layout from '@/components/Layout'
import NotFound from '@/components/NotFound'
import { useCliStatus } from '@/hooks/useCliStatus'
import { useTheme } from '@/hooks/useTheme'
import { I18nContext, useI18nState } from '@/i18n'

function ErrorComponent({ error }: { readonly error: Error }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-bold text-destructive">出错了</h1>
      <p className="text-sm text-muted-foreground">{error.message}</p>
    </div>
  )
}

function RootComponent() {
  const i18n = useI18nState()
  useTheme()
  const { state, recheck } = useCliStatus()

  return (
    <I18nContext.Provider value={i18n}>
      <Layout>
        {state.kind === 'checking' && (
          <div className="flex h-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
        {state.kind === 'missing' && (
          <CliMissingBanner
            error={state.error}
            onRetry={recheck}
            checking={false}
          />
        )}
        {state.kind === 'available' && <Outlet />}
      </Layout>
    </I18nContext.Provider>
  )
}

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: ErrorComponent,
})
