import PluginsPage from '@/pages/PluginsPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/plugins')({
  component: PluginsPage,
})
