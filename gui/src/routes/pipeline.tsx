import { createFileRoute } from '@tanstack/react-router'
import { lazy } from 'react'

const PipelinePage = lazy(() => import('@/pages/PipelinePage'))

export const Route = createFileRoute('/pipeline')({
  component: PipelinePage,
})
