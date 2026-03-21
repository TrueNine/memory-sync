import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="not-found-shell">
      <p className="not-found-code">404 / ROUTE NOT FOUND</p>
      <h1>你摸到了一条不存在的通道。</h1>
      <p>
        当前文档已经重构为首页 `
        /
        ` 加文档命名空间 `
        /docs/*
        `。
        如果你是从旧链接跳来的，很可能命中了已经移除的平铺 MDX 路径。
      </p>
      <div className="not-found-actions">
        <Link href="/" className="hero-button hero-button-primary">
          返回首页
        </Link>
        <Link href="/docs" className="hero-button hero-button-secondary">
          打开文档索引
        </Link>
      </div>
    </main>
  )
}
