import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import { getSiteUrl, siteConfig } from "../lib/site";
import "nextra-theme-docs/style.css";
import "./globals.css";

const docsThemeStorageKey = "memory-sync-docs-theme";
const docsThemeBootstrapScript = `
try {
  const storageKey = '${docsThemeStorageKey}';
  const root = document.documentElement;
  const normalizedTheme = 'dark';

  if (window.localStorage.getItem(storageKey) !== normalizedTheme) {
    window.localStorage.setItem(storageKey, normalizedTheme);
  }

  root.classList.remove('light', 'dark');
  root.classList.add(normalizedTheme);
  root.style.colorScheme = normalizedTheme;
} catch {}
`;

const sans = Inter({
  variable: "--font-sans",
  preload: true,
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  preload: true,
});

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: siteConfig.title,
    template: `%s | ${siteConfig.productName}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.shortName,
  alternates: {
    canonical: "/",
  },
  category: "developer tools",
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    url: "/",
    title: siteConfig.title,
    description: siteConfig.description,
    siteName: siteConfig.title,
    locale: "zh_CN",
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.title,
    description: siteConfig.description,
  },
};

export default function RootLayout({ children }: { readonly children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="dark" style={{ colorScheme: "dark", backgroundColor: "#0b0c10" }} suppressHydrationWarning>
      <body className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
        <Script id="docs-theme-bootstrap" strategy="beforeInteractive">
          {docsThemeBootstrapScript}
        </Script>
        {children}
      </body>
    </html>
  );
}
