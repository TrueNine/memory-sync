import { createFileRoute } from '@tanstack/react-router'
import { lazy } from 'react'

const AdaptorsPage = lazy(() => import('@/pages/AdaptorsPage'))

export const Route = createFileRoute('/adaptors')({
  component: AdaptorsPage,
})
