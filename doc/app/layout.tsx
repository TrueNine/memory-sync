import type {Metadata} from 'next'
import {IBM_Plex_Mono, Noto_Sans_SC} from 'next/font/google'
import {getSiteUrl, siteConfig} from '../lib/site'
import 'nextra-theme-docs/style.css'
import './globals.css'

const sans = Noto_Sans_SC({
  variable: '--font-sans',
  preload: false,
  weight: ['400', '500', '700', '900']
})

const mono = IBM_Plex_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600']
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
        {children}
      </body>
    </html>
  )
}
