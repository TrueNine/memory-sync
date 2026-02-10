import ConfigPage from '@/pages/ConfigPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/config')({
  component: ConfigPage,
})
