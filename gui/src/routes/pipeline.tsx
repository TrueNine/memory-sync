import PipelinePage from '@/pages/PipelinePage'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/pipeline')({
  component: PipelinePage,
})
