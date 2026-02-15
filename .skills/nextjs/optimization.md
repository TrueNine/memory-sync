# Performance Optimisation Guide

## Image Optimisation

### next/image

```typescript
import Image from 'next/image'

// Local image (auto-detects dimensions)
import profilePic from './profile.jpg'
<Image src={profilePic} alt="Profile" />

// Remote image (requires dimensions)
<Image
  src="https://example.com/image.jpg"
  alt="Description"
  width={500}
  height={300}
/>

// Fill container
<div className="relative h-64">
  <Image
    src="/hero.jpg"
    alt="Hero"
    fill
    className="object-cover"
  />
</div>

// Priority loading (LCP images)
<Image src="/hero.jpg" alt="Hero" priority />
```

### Configure Remote Images

```typescript
// next.config.js
module.exports = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'example.com',
        pathname: '/images/**',
      },
    ],
  },
}
```

### External Image Service

```typescript
// next.config.js
module.exports = {
  images: {
    loader: 'custom',
    loaderFile: './image-loader.js',
  },
}

// image-loader.js
export default function cloudflareLoader({ src, width, quality }) {
  return `https://your-cf.com/cdn-cgi/image/width=${width},quality=${quality || 75}/${src}`
}
```

## Font Optimisation

### next/font

```typescript
// app/layout.tsx
import { Inter, Noto_Sans_SC } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
})

const notoSansSC = Noto_Sans_SC({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
})

export default function RootLayout({ children }) {
  return (
    <html lang="zh" className={`${inter.variable} ${notoSansSC.variable}`}>
      <body>{children}</body>
    </html>
  )
}
```

### Local Fonts

```typescript
import localFont from 'next/font/local'

const myFont = localFont({
  src: './fonts/MyFont.woff2',
  display: 'swap',
})
```

## Script Optimisation

### next/script

```typescript
import Script from 'next/script'

// Lazy load (default)
<Script src="https://example.com/script.js" />

// Load after page interaction
<Script src="https://example.com/analytics.js" strategy="lazyOnload" />

// Load before page (blocking)
<Script src="https://example.com/critical.js" strategy="beforeInteractive" />

// Worker thread
<Script src="https://example.com/heavy.js" strategy="worker" />
```

## Code Splitting

### Dynamic Imports

```typescript
import dynamic from 'next/dynamic'

// Client component dynamic import
const DynamicChart = dynamic(() => import('./Chart'), {
  loading: () => <p>Loading chart...</p>,
  ssr: false, // Disable SSR
})

// Server component dynamic import
const DynamicComponent = dynamic(() => import('./Component'))
```

### Route-Level Splitting

App Router automatically splits code by route.

## Caching Strategies

### Data Cache

```typescript
// Static data (cached at build)
fetch(url)

// Dynamic data (no cache)
fetch(url, { cache: 'no-store' })

// ISR (timed revalidation)
fetch(url, { next: { revalidate: 60 } })
```

### Route Cache

```typescript
// Static route
export const dynamic = 'force-static'

// Dynamic route
export const dynamic = 'force-dynamic'

// ISR
export const revalidate = 60
```

## Bundle Analysis

```bash
# Install
pnpm add @next/bundle-analyzer

# next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

module.exports = withBundleAnalyzer({
  // config
})

# Run
ANALYZE=true pnpm build
```

## Core Web Vitals

### LCP (Largest Contentful Paint)

- Use `priority` attribute to preload above-fold images
- Optimise server response time
- Use CDN

### FID (First Input Delay)

- Reduce JavaScript execution time
- Use `dynamic` to lazy load non-critical components
- Use Web Workers for heavy computation

### CLS (Cumulative Layout Shift)

- Specify dimensions for images
- Reserve space for dynamic content
- Avoid inserting content above existing content

## Best Practices Checklist

1. ✅ Use `next/image` for image optimisation
2. ✅ Use `next/font` for font optimisation
3. ✅ Use `next/script` for lazy loading scripts
4. ✅ Dynamic import non-critical components
5. ✅ Set appropriate caching strategies
6. ✅ Use Server Components to reduce client JS
7. ✅ Regularly analyse bundle size
8. ✅ Monitor Core Web Vitals
