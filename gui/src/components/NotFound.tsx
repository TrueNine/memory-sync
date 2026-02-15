import type { FC } from 'react'

import { Link } from '@tanstack/react-router'

const NotFound: FC = () => {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground">页面未找到</p>
      <Link to="/" className="text-primary hover:underline">
        返回首页
      </Link>
    </div>
  )
}

export default NotFound
