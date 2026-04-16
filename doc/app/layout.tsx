import type {Metadata} from 'next'
import React from 'react'
import {getSiteUrl, siteConfig, withBasePath} from '@/lib/site'
import 'nextra-theme-docs/style.css'
import './globals.scss'

export const metadata: Metadata = {
  metadataBase: getSiteUrl('/'),
  title: {
    default: siteConfig.title,
    template: `%s | ${siteConfig.productName}`
  },
  description: siteConfig.description,
  applicationName: siteConfig.shortName,
  alternates: {
    canonical: withBasePath('/')
  },
  category: 'developer tools',
  manifest: withBasePath('/manifest.webmanifest'),
  openGraph: {
    type: 'website',
    url: withBasePath('/'),
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
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
