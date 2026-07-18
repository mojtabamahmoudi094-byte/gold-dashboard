import type { Metadata } from 'next'
import AnalysisPage from './AnalysisClient'

export const metadata: Metadata = {
  title: 'تحلیل بازارها',
  description: 'تحلیل لحظه‌ای طلا و نقره — انس جهانی، ارز، سکه، مثقال، گرم، حباب اسمی صندوق‌ها. برای اعضای بورس سنج.',
}

export default function Page() {
  return <AnalysisPage />
}
