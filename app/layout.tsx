import './globals.css'
import type { Metadata } from 'next'
import Script from 'next/script'
import Header from './components/Header'
import Breadcrumb from './components/Breadcrumb'
import Footer from './components/Footer'
import ChatWidget from './components/ChatWidget'
import ScrollProgress from './components/ScrollProgress'
import ScrollToTop from './components/ScrollToTop'
import PageViewLogger from './components/PageViewLogger'
import ToastProvider from './components/ui/Toast'
import { SITE_URL } from '../lib/site'

const GA_MEASUREMENT_ID = 'G-645YCKXK75'

const title = 'بورس سنج | ترمینال هوشمند بازار'
const description = 'پلتفرم تحلیل و رصد صندوق‌های کالایی بورس ایران'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: title, template: '%s | بورس سنج' },
  description,
  alternates: { canonical: '/' },
  openGraph: {
    title,
    description,
    url: SITE_URL,
    siteName: 'بورس سنج',
    locale: 'fa_IR',
    type: 'website',
    images: [{ url: '/icon.jpeg', width: 256, height: 256, alt: 'بورس سنج' }],
  },
  twitter: {
    card: 'summary',
    title,
    description,
    images: ['/icon.jpeg'],
  },
}

const jsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'بورس سنج',
    url: SITE_URL,
    logo: `${SITE_URL}/icon.jpeg`,
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'بورس سنج',
    url: SITE_URL,
    inLanguage: 'fa-IR',
  },
]

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fa" dir="rtl">
      <body style={{ margin: 0, padding: 0 }}>
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga4-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `}
        </Script>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
        <PageViewLogger />
        <ScrollProgress />
        <ToastProvider>
          <Header />
          <Breadcrumb />
          {children}
          <Footer />
          <ChatWidget />
          <ScrollToTop />
        </ToastProvider>
      </body>
    </html>
  )
}
