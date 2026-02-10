import { createFileRoute } from '@tanstack/react-router'
import { lazy } from 'react'

const SettingsPage = lazy(() => import('@/pages/SettingsPage'))

export const Route = createFileRoute('/settings')({
  component: SettingsPage,
})
