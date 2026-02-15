import { createFileRoute } from '@tanstack/react-router'
import { lazy } from 'react'

const DashboardPage = lazy(() => import('@/pages/DashboardPage'))

export const Route = createFileRoute('/')({
  component: DashboardPage,
})
