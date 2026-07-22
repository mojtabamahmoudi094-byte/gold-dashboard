import type { Metadata } from 'next'
import SignalsPage from './SignalsClient'
import AiDisclaimer from '../../components/AiDisclaimer'

export const metadata: Metadata = {
  title: 'سیگنال‌ها',
  description: 'رتبه‌بندی روزانه صندوق‌ها و سهام بر اساس فاصله قیمت از NAV، جریان پول حقیقی و رشد سود — صرفاً جنبه اطلاع‌رسانی دارد، توصیه سرمایه‌گذاری نیست. برای اعضای بورس سنج.',
}

export default function Page() {
  return (
    <>
      <AiDisclaimer />
      <SignalsPage />
    </>
  )
}
