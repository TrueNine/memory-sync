import { createFileRoute } from '@tanstack/react-router'
import { lazy } from 'react'

const PluginsPage = lazy(() => import('@/pages/PluginsPage'))

export const Route = createFileRoute('/plugins')({
  component: PluginsPage,
})
