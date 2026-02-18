import type { ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';

export const metadata = {
  title: 'memory-sync Documentation',
  description: 'Official documentation for @truenine/memory-sync, the cross-AI prompt synchronisation toolkit.'
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="docs-shell">
          <header className="docs-header">
            <div className="docs-header-title">
              <span className="docs-header-label">Docs</span>
              <div className="docs-header-main">
                <h1 className="docs-header-name">memory-sync</h1>
                <span className="docs-header-desc">Cross-AI prompt synchronisation</span>
              </div>
            </div>
            <nav className="docs-header-nav">
              <Link href="/" className="docs-header-link">
                文档首页
              </Link>
              <Link href="/getting-started" className="docs-header-link">
                快速上手
              </Link>
              <Link href="/config" className="docs-header-link">
                配置
              </Link>
              <a
                href="https://github.com/truenine/memory-sync"
                target="_blank"
                rel="noreferrer"
                className="docs-header-link docs-header-link-muted"
              >
                GitHub
              </a>
            </nav>
          </header>

          <div className="docs-layout">
            <aside className="docs-sidebar">
              <div className="docs-sidebar-label">文档导航</div>
              <ul className="docs-sidebar-list">
                <li>
                  <Link href="/" className="docs-sidebar-link">
                    概览
                  </Link>
                </li>
                <li>
                  <Link href="/getting-started" className="docs-sidebar-link">
                    快速上手
                  </Link>
                </li>
                <li>
                  <Link href="/cli" className="docs-sidebar-link">
                    CLI
                  </Link>
                </li>
                <li>
                  <Link href="/gui" className="docs-sidebar-link">
                    GUI
                  </Link>
                </li>
                <li>
                  <Link href="/config" className="docs-sidebar-link">
                    配置
                  </Link>
                </li>
                <li>
                  <Link href="/prompts" className="docs-sidebar-link">
                    Prompts
                  </Link>
                </li>
                <li>
                  <Link href="/advanced" className="docs-sidebar-link">
                    进阶用法
                  </Link>
                </li>
              </ul>
            </aside>

            <main className="docs-main">
              <div className="docs-main-card">
                {children}
              </div>
            </main>
          </div>

          <footer className="docs-footer">
            <p>© {new Date().getFullYear()} TrueNine · Built with Next.js 16 + MDX · Deployed on Vercel</p>
          </footer>
        </div>
      </body>
    </html>
  );
}

