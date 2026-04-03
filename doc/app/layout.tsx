import type {Metadata} from 'next'
import {Inter, JetBrains_Mono} from 'next/font/google'
import {getSiteUrl, siteConfig} from '../lib/site'
import 'nextra-theme-docs/style.css'
import './globals.scss'

const sans = Inter({
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
    <html
      lang="zh-CN"
      className="dark"
      data-scroll-behavior="smooth"
      style={{colorScheme: 'dark', backgroundColor: '#0b0c10'}}
      suppressHydrationWarning
    >
      <body className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
