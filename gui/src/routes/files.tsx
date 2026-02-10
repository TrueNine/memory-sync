import { createFileRoute } from '@tanstack/react-router'
import { lazy } from 'react'

const FilesPage = lazy(() => import('@/pages/FilesPage'))

export const Route = createFileRoute('/files')({
  component: FilesPage,
})
