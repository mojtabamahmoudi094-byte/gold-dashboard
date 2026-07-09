import './globals.css'
import type { Metadata } from 'next'
import Header from './components/Header'
import Footer from './components/Footer'
import ChatWidget from './components/ChatWidget'
import { SITE_URL } from '../lib/site'

const title = 'بورس سنج | ترمینال هوشمند بازار'
const description = 'پلتفرم تحلیل و رصد صندوق‌های کالایی بورس ایران'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title,
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fa" dir="rtl">
      <body style={{ margin: 0, padding: 0 }}>
        <Header />
        {children}
        <Footer />
        <ChatWidget />
      </body>
    </html>
  )
}
