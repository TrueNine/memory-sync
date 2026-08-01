import { createRootRoute, Outlet } from '@tanstack/react-router'
import { Suspense } from 'react'

import Layout from '@/components/Layout'
import NotFound from '@/components/NotFound'
import PageLoading from '@/components/PageLoading'
import { ToastProvider } from '@/components/Toaster'
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

  return (
    <I18nContext.Provider value={i18n}>
      <ToastProvider>
        <Layout>
          <Suspense fallback={<PageLoading />}>
            <Outlet />
          </Suspense>
        </Layout>
      </ToastProvider>
    </I18nContext.Provider>
  )
}

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: ErrorComponent,
})
