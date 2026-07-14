import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'بورس سنج | ترمینال هوشمند بازار',
    short_name: 'بورس سنج',
    description: 'پلتفرم تحلیل و رصد صندوق‌های کالایی بورس ایران',
    start_url: '/',
    display: 'standalone',
    lang: 'fa-IR',
    dir: 'rtl',
    background_color: '#0a0d14',
    theme_color: '#0a0d14',
    icons: [
      { src: '/icon.jpeg', sizes: '256x256', type: 'image/jpeg' },
      { src: '/apple-icon.jpeg', sizes: '180x180', type: 'image/jpeg' },
    ],
  }
}
