import LogsPage from '@/pages/LogsPage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/logs')({
  component: LogsPage,
})
