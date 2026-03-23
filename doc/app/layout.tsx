import type {Metadata} from 'next'
import {JetBrains_Mono} from 'next/font/google'
import Script from 'next/script'
import {getSiteUrl, siteConfig} from '../lib/site'
import 'nextra-theme-docs/style.css'
import './globals.css'

const docsThemeStorageKey = 'memory-sync-docs-theme'
const docsThemeBootstrapScript = `
try {
  const storageKey = '${docsThemeStorageKey}';
  const storedTheme = window.localStorage.getItem(storageKey);
  const normalizedTheme = storedTheme === 'light' ? 'light' : 'dark';

  if (storedTheme !== normalizedTheme) {
    window.localStorage.setItem(storageKey, normalizedTheme);
  }

  document.documentElement.classList.toggle('dark', normalizedTheme === 'dark');
} catch {}
`

const sans = JetBrains_Mono({
  variable: '--font-sans',
  preload: true,
  subsets: ['latin']
})

const mono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  preload: true
})

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: siteConfig.title,
    template: `%s | ${siteConfig.productName}`
  },
  description: siteConfig.description,
  applicationName: siteConfig.shortName,
  alternates: {
    canonical: '/'
  },
  category: 'developer tools',
  manifest: '/manifest.webmanifest',
  openGraph: {
    type: 'website',
    url: '/',
    title: siteConfig.title,
    description: siteConfig.description,
    siteName: siteConfig.title,
    locale: 'zh_CN'
  },
  twitter: {
    card: 'summary_large_image',
    title: siteConfig.title,
    description: siteConfig.description
  }
}

export default function RootLayout({children}: {readonly children: React.ReactNode}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={`${sans.variable} ${mono.variable}`}>
        <Script id="docs-theme-bootstrap" strategy="beforeInteractive">
          {docsThemeBootstrapScript}
        </Script>
        {children}
      </body>
    </html>
  )
}
