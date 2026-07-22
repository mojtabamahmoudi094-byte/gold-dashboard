import type { Metadata } from 'next'
import { pageMetadata } from '../../../lib/pageMetadata'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const name = decodeURIComponent(slug)
  return pageMetadata({
    title: `قیمت صندوق ${name} امروز + تحلیل لحظه‌ای رایگان`,
    description: `قیمت لحظه‌ای، حباب، NAV، جریان پول حقیقی و تحلیل صندوق ${name} — رایگان و بدون ثبت‌نام`,
    path: `/fund/${slug}`,
  })
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
