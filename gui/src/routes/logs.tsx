import { createFileRoute } from '@tanstack/react-router'
import { lazy } from 'react'

const LogsPage = lazy(() => import('@/pages/LogsPage'))

export const Route = createFileRoute('/logs')({
  component: LogsPage,
})
