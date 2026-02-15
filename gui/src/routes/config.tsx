import { createFileRoute } from '@tanstack/react-router'
import { lazy } from 'react'

const ConfigPage = lazy(() => import('@/pages/ConfigPage'))

export const Route = createFileRoute('/config')({
  component: ConfigPage,
})
