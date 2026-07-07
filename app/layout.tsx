import './globals.css'
import type { Metadata } from 'next'
import Header from './components/Header'
import Footer from './components/Footer'
import ChatWidget from './components/ChatWidget'

export const metadata: Metadata = {
  title: 'بورس سنج | ترمینال هوشمند بازار',
  description: 'پلتفرم تحلیل و رصد صندوق‌های کالایی بورس ایران',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fa" dir="rtl">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ margin: 0, padding: 0 }}>
        <Header />
        {children}
        <Footer />
        <ChatWidget />
      </body>
    </html>
  )
}
