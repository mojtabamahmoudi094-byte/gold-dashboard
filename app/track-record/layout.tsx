import { pageMetadata } from '../../lib/pageMetadata'

export const metadata = pageMetadata({
  title: 'نتایج واقعی سیگنال‌های بورس و طلا — آمار شفاف موفقیت',
  description:
    'عملکرد ثبت‌شده تمام سیگنال‌های خرید و فروش بورس سنج به تفکیک سهام، طلا و نقره — درصد موفقیت و بازدهی واقعی هر سیگنال، شفاف و رایگان.',
  path: '/track-record',
})

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
