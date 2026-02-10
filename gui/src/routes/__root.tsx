import { createRootRoute, Outlet } from '@tanstack/react-router'

import Layout from '@/components/Layout'
import NotFound from '@/components/NotFound'
import { useTheme } from '@/hooks/useTheme'
import { I18nContext, useI18nState } from '@/i18n'

function ErrorComponent({ error }: { error: Error }) {
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
  return (
    <I18nContext.Provider value={i18n}>
      <Layout>
        <Outlet />
      </Layout>
    </I18nContext.Provider>
  )
}

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: ErrorComponent,
})
