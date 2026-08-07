import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Sans_Arabic } from 'next/font/google'
import Script from 'next/script'
import { readServerPublicConfig } from '@/lib/public-runtime-config'
import './globals.css'

const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex-arabic',
})

export const metadata: Metadata = {
  title: 'Arabic Buzz',
  description:
    'مساحة عمل عربية للجمعيات — غرف بشر ووكلاء، موافقات بشرية، مواعيد نظام، وسجل تدقيق قابل للمراجعة',
  applicationName: 'Arabic Buzz',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Arabic Buzz',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#0e5a46',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Runtime inject — CranL Docker may not bake NEXT_PUBLIC_* at build time.
  const publicConfig = readServerPublicConfig()
  const publicBoot =
    publicConfig.supabaseUrl && publicConfig.supabaseAnonKey
      ? `window.__AB_PUBLIC__=${JSON.stringify(publicConfig)};`
      : ''

  return (
    <html lang="ar" dir="rtl">
      <body
        className={`${ibmPlexSansArabic.variable} ${ibmPlexSansArabic.className} bg-ab-bg text-ab-ink antialiased`}
      >
        {publicBoot ? (
          <Script id="ab-public-config" strategy="beforeInteractive">
            {publicBoot}
          </Script>
        ) : null}
        {children}
      </body>
    </html>
  )
}
